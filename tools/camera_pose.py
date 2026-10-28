"""Camera pose of an egocentric video by visual odometry with metric depth.

Frame to frame: SIFT matches, the points of the earlier frame are lifted to 3D with its metric depth map
(depth.py), and the pose of the later frame follows from PnP + RANSAC, so the translation is in metres
without a separate scale step. Areas that move on their own (hands, tracked boxes) are left out of the
matching. The world frame is the camera of the first frame of the request (x right, y down, z forward, as
in OpenCV); gravity is not known (the phone's motion data is not available in the video), so "down" is
not aligned.

Honest limits: the depth scale is a network estimate and drifts a little from frame to frame, so the
path is good for seconds, not for minutes; without a loop closure the error grows with the length of
the path. A frame the matching fails on keeps the last pose and is reported with ok = false.
"""

from __future__ import annotations

import math

import cv2
import numpy as np
from scipy.spatial.transform import Rotation

WORK_WIDTH = 640
MIN_DEPTH, MAX_DEPTH = 0.3, 12.0   # metres; nearer / farther depth is not trusted for scale
MIN_MATCHES, MIN_INLIERS = 15, 12


def intrinsics(width: int, height: int, fov_deg: float) -> np.ndarray:
    """Pinhole matrix for the horizontal field of view `fov_deg` (the phone's is not in the file)."""
    f = (width / 2) / math.tan(math.radians(fov_deg) / 2)
    return np.array([[f, 0, width / 2], [0, f, height / 2], [0, 0, 1]], dtype=np.float64)


class Odometry:
    def __init__(self, fov_deg: float = 65.0):
        self.fov = fov_deg
        self.sift = cv2.SIFT_create(nfeatures=2500)
        self.matcher = cv2.BFMatcher(cv2.NORM_L2)
        self.pose = np.eye(4)            # camera -> world
        self.ref: dict | None = None     # the frame the next one is matched against
        self.K: np.ndarray | None = None
        self.scale = 1.0                 # work pixels per full-frame pixel

    def _prepare(self, image: np.ndarray, depth: np.ndarray, exclude: list[list[float]]) -> dict:
        height, width = image.shape[:2]
        if self.K is None:
            self.scale = WORK_WIDTH / width
            self.work = (WORK_WIDTH, round(height * self.scale))
            self.K = intrinsics(self.work[0], self.work[1], self.fov)
        gray = cv2.cvtColor(cv2.resize(image, self.work, interpolation=cv2.INTER_AREA), cv2.COLOR_RGB2GRAY)
        depth = cv2.resize(depth, self.work, interpolation=cv2.INTER_LINEAR)
        mask = ((depth > MIN_DEPTH) & (depth < MAX_DEPTH)).astype(np.uint8) * 255
        for x1, y1, x2, y2 in exclude:
            pad_x, pad_y = (x2 - x1) * 0.15, (y2 - y1) * 0.15  # a hand is bigger than its box edge
            a = [max(0, int((x1 - pad_x) * self.scale)), max(0, int((y1 - pad_y) * self.scale))]
            b = [int((x2 + pad_x) * self.scale), int((y2 + pad_y) * self.scale)]
            cv2.rectangle(mask, tuple(a), tuple(b), 0, thickness=-1)
        keypoints, descriptors = self.sift.detectAndCompute(gray, mask)
        return {
            'points': np.array([k.pt for k in keypoints], dtype=np.float64).reshape(-1, 2),
            'descriptors': descriptors, 'depth': depth,
        }

    def _lift(self, ref: dict, points: np.ndarray) -> np.ndarray:
        u, v = points[:, 0], points[:, 1]
        z = ref['depth'][np.clip(v.astype(int), 0, ref['depth'].shape[0] - 1),
                         np.clip(u.astype(int), 0, ref['depth'].shape[1] - 1)].astype(np.float64)
        fx, cx, cy = self.K[0, 0], self.K[0, 2], self.K[1, 2]
        return np.stack([(u - cx) * z / fx, (v - cy) * z / fx, z], axis=1)

    def step(self, image: np.ndarray, depth: np.ndarray, exclude: list[list[float]]) -> dict:
        """Pose of this frame. `depth` is its metric depth map (metres, any size); `exclude` full-frame boxes."""
        current = self._prepare(image, depth, exclude)
        info = {'ok': True, 'matches': 0, 'inliers': 0}
        if self.ref is None:
            self.ref = current
        else:
            solved = self._solve(self.ref, current)
            info.update(matches=solved['matches'], inliers=solved['inliers'])
            if solved['T'] is None:
                info['ok'] = False   # keep the last pose and keep matching against the older reference
            else:
                self.pose = self.pose @ np.linalg.inv(solved['T'])
                self.ref = current
        return {
            **info,
            'position': [round(float(x), 5) for x in self.pose[:3, 3]],
            'quaternion': [round(float(x), 6) for x in Rotation.from_matrix(self.pose[:3, :3]).as_quat()],
        }

    def _solve(self, ref: dict, cur: dict) -> dict:
        none = {'T': None, 'matches': 0, 'inliers': 0}
        if ref['descriptors'] is None or cur['descriptors'] is None or len(cur['points']) < MIN_MATCHES:
            return none
        good = []
        for pair in self.matcher.knnMatch(ref['descriptors'], cur['descriptors'], k=2):
            if len(pair) == 2 and pair[0].distance < 0.75 * pair[1].distance:
                good.append(pair[0])
        if len(good) < MIN_MATCHES:
            return {**none, 'matches': len(good)}
        before = ref['points'][[m.queryIdx for m in good]]
        after = cur['points'][[m.trainIdx for m in good]]
        object_points = self._lift(ref, before)
        valid = (object_points[:, 2] > MIN_DEPTH) & (object_points[:, 2] < MAX_DEPTH)
        if valid.sum() < MIN_MATCHES:
            return {**none, 'matches': int(valid.sum())}
        ok, rvec, tvec, inliers = cv2.solvePnPRansac(
            object_points[valid], after[valid], self.K, None, iterationsCount=400, reprojectionError=3.0,
            confidence=0.999, flags=cv2.SOLVEPNP_EPNP,
        )
        count = 0 if inliers is None else len(inliers)
        if not ok or count < MIN_INLIERS:
            return {**none, 'matches': int(valid.sum()), 'inliers': count}
        idx = inliers[:, 0]
        rvec, tvec = cv2.solvePnPRefineLM(object_points[valid][idx], after[valid][idx], self.K, None, rvec, tvec)
        T = np.eye(4)
        T[:3, :3] = cv2.Rodrigues(rvec)[0]
        T[:3, 3] = tvec[:, 0]
        return {'T': T, 'matches': int(valid.sum()), 'inliers': count}
