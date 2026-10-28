"""Rebuilds the 3D part of the viewer data for the whole video, as several scenes.

    python tools/build_scenes.py site            # reads site/data.json.gz + site/video.mp4, writes the result back

Visual odometry (SIFT + PnP on metric depth, tools/camera_pose.py) cannot hold one world frame through the whole
episode: when a close-up of cloth fills the picture the matching is lost for good. So the path is cut where
LOST_RUN poses in a row are lost, and every piece that is long enough becomes its own scene with its own world
frame (the camera of its first frame), its own scale (fitted to the size of the hand), hands and point cloud.

Result in data.json: `scenes` = [{start, end, fov_deg, scale, camera, hands, cloud}] (frames of the episode), and
one `cloud_<n>.bin.gz` per scene. The old single `geometry` and `cloud.bin.gz` are replaced.
"""

from __future__ import annotations

import argparse
import gzip
import json
import math
import struct
import sys
from pathlib import Path

import cv2
import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image
from scipy.spatial.transform import Rotation

sys.path.insert(0, str(Path(__file__).parent))
from camera_pose import Odometry, intrinsics  # noqa: E402

MODEL_ID = 'depth-anything/Depth-Anything-V2-Metric-Indoor-Small-hf'
STEP = 6                  # frames of the episode between two camera poses (0.1 s)
LOST_RUN = 5              # this many lost poses in a row end a scene
MIN_SCENE_S = 3.0         # shorter pieces are not worth a scene
MIN_OK_POSES = 15
DEPTH_SIDE = 384          # long side of the depth map
MIN_Z, MAX_Z = 0.25, 6.0  # metres, after scaling
EDGE = 0.08               # a neighbour pixel further than this share of the depth is a depth jump
MAX_POINTS = 150_000
FOV = 65.0
PALM = [0, 5, 9, 13, 17]
SIZE_BONES = [(0, 5), (0, 17), (5, 17), (0, 9), (9, 12)]
MIN_SCALE_POSES = 10


def load_depth_model():
    from transformers import AutoImageProcessor, AutoModelForDepthEstimation
    return AutoImageProcessor.from_pretrained(MODEL_ID), AutoModelForDepthEstimation.from_pretrained(MODEL_ID).to('cuda').eval()


def depth_metres(model, image: np.ndarray) -> np.ndarray:
    processor, net = model
    height, width = image.shape[:2]
    scale = 518 / max(height, width)
    size = (max(14, round(width * scale / 14) * 14), max(14, round(height * scale / 14) * 14))
    picture = Image.fromarray(image).resize(size, Image.BICUBIC)
    inputs = processor(images=picture, return_tensors='pt', do_resize=False)
    with torch.inference_mode():
        out = net(pixel_values=inputs['pixel_values'].to('cuda'))
    depth = out.predicted_depth.float()[None]
    scale = DEPTH_SIDE / max(height, width)
    out_size = (max(1, round(height * scale)), max(1, round(width * scale)))
    return F.interpolate(depth, size=out_size, mode='bilinear', align_corners=False)[0, 0].clamp(0, 65).cpu().numpy()


def hand_boxes_at(tracks: dict, hand_ids: list[str], frame: int) -> list[list[float]]:
    boxes = []
    for key in hand_ids:
        track = tracks.get(key)
        if not track:
            continue
        i = int(np.searchsorted(track['f'], frame))
        for j in (i - 1, i):
            if 0 <= j < len(track['f']) and abs(track['f'][j] - frame) <= STEP and track['b'][j]:
                boxes.append(track['b'][j])
                break
    return boxes


def run_odometry(data: dict, video: Path) -> list[dict]:
    """Walks the video, returns the raw pieces: poses, depth and picture of every computed frame."""
    ep = data['episode']
    dfps, total, width, height = ep['fps'], ep['total_frames'], ep['width'], ep['height']
    hand_ids = [str(o['id']) for o in data['objects'] if o['kind'] == 'hand']
    model = load_depth_model()
    cap = cv2.VideoCapture(str(video))
    vfps = cap.get(cv2.CAP_PROP_FPS)
    wanted = list(range(0, total, STEP))
    pieces: list[dict] = []
    odometry = None
    piece = None
    lost = 0

    def close():
        nonlocal piece
        if piece and piece['frames']:
            # the poses of the lost run only repeat the last good pose: cut them off
            last_ok = max((i for i, ok in enumerate(piece['ok']) if ok), default=-1)
            for key in ('frames', 'pos', 'quat', 'ok', 'depth', 'rgb'):
                piece[key] = piece[key][:last_ok + 1]
            if piece['frames']:
                pieces.append(piece)
        piece = None

    video_index = -1
    for n, frame in enumerate(wanted):
        target = round(frame / dfps * vfps)
        while video_index < target:
            if not cap.grab():
                break
            video_index += 1
        ok_read, bgr = cap.retrieve()
        if not ok_read:
            break
        image = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        depth = depth_metres(model, image)
        exclude = hand_boxes_at(data['tracks'], hand_ids, frame)
        # boxes are in full-resolution pixels of the episode; the odometry works on the proxy picture
        sx, sy = image.shape[1] / width, image.shape[0] / height
        exclude_proxy = [[x1 * sx, y1 * sy, x2 * sx, y2 * sy] for x1, y1, x2, y2 in exclude]
        if odometry is None:
            odometry = Odometry(FOV)
            piece = {'frames': [], 'pos': [], 'quat': [], 'ok': [], 'depth': [], 'rgb': []}
            lost = 0
        result = odometry.step(image, depth, exclude_proxy)
        piece['frames'].append(frame)
        piece['pos'].append(result['position'])
        piece['quat'].append(result['quaternion'])
        piece['ok'].append(bool(result['ok']))
        piece['depth'].append(depth.astype(np.float16))
        piece['rgb'].append(cv2.resize(image, (depth.shape[1], depth.shape[0]), interpolation=cv2.INTER_AREA))
        lost = 0 if result['ok'] else lost + 1
        if lost >= LOST_RUN:
            close()
            odometry = None
        if n % 100 == 0:
            print(f'  odometry {n}/{len(wanted)} frames, {len(pieces)} pieces', flush=True)
    close()
    cap.release()
    return pieces


def palm_depth(depth: np.ndarray, u: float, v: float, width: float, height: float, window: int = 2):
    dh, dw = depth.shape
    x, y = int(u / width * dw), int(v / height * dh)
    if not (0 <= x < dw and 0 <= y < dh):
        return None
    patch = depth[max(0, y - window): y + window + 1, max(0, x - window): x + window + 1].astype(np.float32)
    patch = patch[patch > 0.05]
    return float(np.median(patch)) if patch.size else None


def hand_size_distance(k2: list[float], relative: np.ndarray, focal: float):
    zs = []
    for a, b in SIZE_BONES:
        l2 = math.hypot(k2[3 * a] - k2[3 * b], k2[3 * a + 1] - k2[3 * b + 1])
        l3 = math.hypot(relative[a, 0] - relative[b, 0], relative[a, 1] - relative[b, 1])
        if l2 > 8 and l3 > 0.02:
            zs.append(focal * l3 / l2)
    return float(np.median(zs)) if len(zs) >= 3 else None


def build_scene(data: dict, piece: dict, out_dir: Path, index: int) -> dict:
    ep = data['episode']
    width, height = float(ep['width']), float(ep['height'])
    K = intrinsics(width, height, FOV)
    frames = np.array(piece['frames'])
    pos = np.array(piece['pos'], dtype=np.float64)
    rot = Rotation.from_quat(np.array(piece['quat']))

    def nearest(f: int):
        i = int(np.searchsorted(frames, f))
        best = min((j for j in (i - 1, i) if 0 <= j < len(frames)), key=lambda j: abs(int(frames[j]) - f), default=None)
        return best if best is not None and abs(int(frames[best]) - f) <= STEP // 2 else None
    hand_ids = [str(o['id']) for o in data['objects'] if o['kind'] == 'hand']

    # 1. distance of every hand pose from the depth map and from the size of the hand
    found: dict[str, list[dict]] = {}
    for side, h in data['hands'].items():
        for f, k2, k3 in zip(h['f'], h['k2'], h['k3']):
            i = nearest(int(f))
            if i is None or not k2 or not k3 or not piece['ok'][i]:
                continue
            relative = np.array(k3, dtype=np.float64).reshape(21, 3)
            values = [palm_depth(piece['depth'][i], k2[3 * j], k2[3 * j + 1], width, height) for j in PALM]
            values = [v for v in values if v is not None]
            if len(values) < 3:
                continue
            z = float(np.median(values)) - float(np.mean(relative[PALM, 2]))
            if z <= 0:
                continue
            found.setdefault(side, []).append({'i': i, 'f': int(f), 'k2': k2, 'z': z, 'rel': relative,
                                               'z_hand': hand_size_distance(k2, relative, K[0, 0])})
    ratios = [x['z_hand'] / x['z'] for items in found.values() for x in items if x['z_hand']]
    factor, method = 1.0, 'depth'
    if len(ratios) >= MIN_SCALE_POSES:
        factor, method = float(np.median(ratios)), 'hand_size'
    pos = pos * factor

    # 2. wrists in the world of this scene (median over three neighbouring poses removes single-frame jumps)
    hands = {}
    for side, items in found.items():
        raw = [x['z'] * factor for x in items]
        out = {'f': [], 'wrist': []}
        for n, item in enumerate(items):
            near = [raw[m] for m in (n - 1, n, n + 1) if 0 <= m < len(items) and abs(items[m]['f'] - item['f']) <= 2 * STEP]
            z = float(np.median(near))
            u, v = item['k2'][0], item['k2'][1]
            wrist_camera = np.array([(u - K[0, 2]) * z / K[0, 0], (v - K[1, 2]) * z / K[1, 1], z])
            world = rot[item['i']].apply(wrist_camera) + pos[item['i']]
            out['f'].append(item['f'])
            out['wrist'].append([round(float(c), 5) for c in world])
        hands[side] = out

    # 3. point cloud
    dh, dw = piece['depth'][0].shape
    Kd = intrinsics(dw, dh, FOV)
    good = [i for i, ok in enumerate(piece['ok']) if ok]
    stride = max(1, int(np.ceil(np.sqrt(dw * dh * len(good) / MAX_POINTS))))
    points, colors = [], []
    for i in good:
        depth = piece['depth'][i].astype(np.float32) * factor
        valid = (depth > MIN_Z) & (depth < MAX_Z)
        for shift in ((0, 1), (1, 0)):
            valid &= np.abs(depth - np.roll(depth, shift, axis=(0, 1))) < EDGE * depth
        for x1, y1, x2, y2 in hand_boxes_at(data['tracks'], hand_ids, int(frames[i])):
            px, py = (x2 - x1) * 0.2, (y2 - y1) * 0.2
            valid[max(0, int((y1 - py) / height * dh)): int((y2 + py) / height * dh) + 1,
                  max(0, int((x1 - px) / width * dw)): int((x2 + px) / width * dw) + 1] = False
        mask = np.zeros_like(valid)
        mask[::stride, ::stride] = True
        ys, xs = np.nonzero(valid & mask)
        z = depth[ys, xs].astype(np.float64)
        camera_points = np.stack([(xs + 0.5 - Kd[0, 2]) * z / Kd[0, 0], (ys + 0.5 - Kd[1, 2]) * z / Kd[1, 1], z], axis=1)
        points.append(rot[i].apply(camera_points) + pos[i])
        colors.append(piece['rgb'][i][ys, xs])
    cloud_name = None
    if points:
        xyz = np.concatenate(points).astype('<f4')
        rgb = np.concatenate(colors).astype('u1')
        cloud_name = f'cloud_{index}.bin.gz'
        (out_dir / cloud_name).write_bytes(gzip.compress(struct.pack('<I', len(xyz)) + xyz.tobytes() + rgb.tobytes(), 6))

    return {
        'fov_deg': FOV, 'start': int(frames[0]), 'end': int(frames[-1]),
        'scale': {'method': method, 'factor': round(factor, 4), 'poses_used': len(ratios) if method == 'hand_size' else 0,
                  'ratio_p10_p90': [round(float(x), 3) for x in np.percentile(ratios, [10, 90])] if ratios else None},
        'camera': {'f': [int(f) for f in frames], 'p': [[round(float(c), 5) for c in p] for p in pos], 'ok': piece['ok']},
        'hands': hands, 'cloud': cloud_name,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('site', type=Path)
    args = parser.parse_args()
    site = args.site
    data_path = site / 'data.json.gz'
    data = json.loads(gzip.open(data_path).read().decode('utf-8'))
    fps = data['episode']['fps']
    pieces = run_odometry(data, site / 'video.mp4')
    print(f'{len(pieces)} pieces:', [(round(p['frames'][0] / fps, 1), round(p['frames'][-1] / fps, 1), sum(p['ok'])) for p in pieces])
    kept = [p for p in pieces if (p['frames'][-1] - p['frames'][0]) / fps >= MIN_SCENE_S and sum(p['ok']) >= MIN_OK_POSES]
    for old in site.glob('cloud*.bin.gz'):
        old.unlink()
    scenes = [build_scene(data, p, site, n) for n, p in enumerate(kept)]
    for s in scenes:
        print(f'scene {s["start"] / fps:.1f}-{s["end"] / fps:.1f} s, scale {s["scale"]["method"]} x{s["scale"]["factor"]}, '
              f'hands {sum(len(h["f"]) for h in s["hands"].values())}, cloud {s["cloud"]}')
    data['scenes'] = scenes
    data.pop('geometry', None)
    data_path.write_bytes(gzip.compress(json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode('utf-8'), 9, mtime=0))


if __name__ == '__main__':
    main()
