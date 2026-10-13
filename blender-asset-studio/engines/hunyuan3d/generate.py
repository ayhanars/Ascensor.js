"""Single image -> GLB with Hunyuan3D 2 (shape only). Runs on Apple Silicon via MPS, or CUDA/CPU.

Environment overrides:
  HY3D_MODEL      default tencent/Hunyuan3D-2mini   (tencent/Hunyuan3D-2 for the full model, needs more RAM)
  HY3D_SUBFOLDER  default hunyuan3d-dit-v2-mini      (hunyuan3d-dit-v2-0 for the full model)
  HY3D_STEPS      default 30
  HY3D_OCTREE     default 256                        (higher = finer surface, slower; 384 on 32 GB machines)
"""
import argparse
import os
import sys
import time


def log(msg: str) -> None:
    print(f"[hunyuan3d] {msg}", flush=True)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("input", nargs="?")
    ap.add_argument("output", nargs="?")
    ap.add_argument("--check", action="store_true", help="only report the device and exit")
    args = ap.parse_args()

    import torch  # noqa: WPS433

    if torch.backends.mps.is_available():
        device = "mps"
    elif torch.cuda.is_available():
        device = "cuda"
    else:
        device = "cpu"
    log(f"torch {torch.__version__}, device {device}")
    if args.check:
        try:
            import hy3dgen  # noqa: F401
            log("hy3dgen import OK")
        except Exception as e:  # pragma: no cover
            log(f"hy3dgen import failed: {e}")
            return 1
        return 0
    if not args.input or not args.output:
        ap.error("input and output are required")

    model = os.environ.get("HY3D_MODEL", "tencent/Hunyuan3D-2mini")
    subfolder = os.environ.get("HY3D_SUBFOLDER", "hunyuan3d-dit-v2-mini")
    steps = int(os.environ.get("HY3D_STEPS", "30"))
    octree = int(os.environ.get("HY3D_OCTREE", "256"))

    from PIL import Image
    from hy3dgen.rembg import BackgroundRemover
    from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline

    t0 = time.time()
    log(f"loading {model} ({subfolder}); first run downloads the weights")
    pipeline = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained(model, subfolder=subfolder, device=device)
    log(f"model ready in {time.time() - t0:.0f}s")

    image = Image.open(args.input).convert("RGBA")
    log(f"removing background from {os.path.basename(args.input)} ({image.width}x{image.height})")
    image = BackgroundRemover()(image)

    t1 = time.time()
    log(f"generating shape: {steps} steps, octree {octree}")
    mesh = pipeline(image=image, num_inference_steps=steps, octree_resolution=octree, output_type="trimesh")[0]
    log(f"shape done in {time.time() - t1:.0f}s: {len(mesh.vertices)} vertices, {len(mesh.faces)} faces")
    mesh.export(args.output)
    log(f"wrote {args.output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
