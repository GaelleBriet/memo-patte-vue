#!/usr/bin/env python3
"""Construit `resources/` (entrées de `@capacitor/assets`) depuis les sources de
`docs/design/logos/`, qui ne sont jamais modifiées.

Prérequis : Python 3, Pillow, numpy. Lancer depuis la racine du dépôt :

    python3 scripts/build-icon-resources.py

Corrections appliquées (cf. docs/design/logos/logos.md, « Fichiers dérivés ») :
1. canevas carré 1024 × 1024 transparent, illustration centrée ;
2. zone de sécurité : `@capacitor/assets` insère les couches avec un inset de
   16,7 %, donc le canevas 1024 px correspond aux 72 dp visibles de l'icône
   adaptative (108 dp). L'illustration est réduite pour tenir dans 66 dp, soit
   66/72 = 91,7 % du canevas (939 px), et aucun pixel ne sort du cercle de
   66 dp (masque circulaire) ;
3. background = aplat pétrole #01383E plein bord ;
4. halo blanc du détourage : poussières retirées, puis pixels semi-transparents
   dé-composés depuis le blanc (un-premultiply).
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "docs" / "design" / "logos"
OUT = ROOT / "resources"

PETROLE = (0x01, 0x38, 0x3E)
ICON = 1024
VIEWPORT_DP, SAFE_DP, CANVAS_DP = 72, 66, 108
SAFE_PX = round(ICON * SAFE_DP / VIEWPORT_DP)  # 939 px
FLAT_RATIO = 0.80  # icône à plat (aucun masque) : illustration à 80 % du côté
SPLASH = 2732  # taille attendue par @capacitor/assets, recadrée par densité
SPLASH_ILLU = 720  # plus grande dimension de l'illustration sur le splash


def clean_alpha(alpha: np.ndarray, opening: int = 9, margin: int = 9):
    """Retire les poussières de détourage : ne garde que les pixels situés à
    moins de `margin` px d'une zone opaque d'au moins `opening` px."""
    solid = Image.fromarray(((alpha > 200) * 255).astype(np.uint8))
    opened = solid.filter(ImageFilter.MinFilter(opening)).filter(ImageFilter.MaxFilter(opening))
    keep = np.array(opened.filter(ImageFilter.MaxFilter(margin))) > 0
    cleaned = alpha.copy()
    cleaned[~keep] = 0
    return cleaned, int((alpha > 0).sum() - (cleaned > 0).sum())


def unpremultiply_from_white(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """Les pixels semi-transparents ont été composés sur blanc :
    C = α·F + (1 − α)·255, donc F = (C − (1 − α)·255) / α."""
    a = alpha.astype(np.float64) / 255.0
    with np.errstate(divide="ignore", invalid="ignore"):
        f = (rgb.astype(np.float64) - (1 - a)[..., None] * 255.0) / a[..., None]
    f = np.clip(np.nan_to_num(f, nan=0.0, posinf=255.0, neginf=0.0), 0, 255)
    out = rgb.copy()
    semi = (alpha > 0) & (alpha < 255)
    out[semi] = f[semi].round().astype(np.uint8)
    out[alpha == 0] = PETROLE  # couleur neutre sous les pixels transparents
    return out


def bbox(alpha: np.ndarray):
    ys, xs = np.where(alpha > 0)
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def place(layer: Image.Image, size: int, target: int, circle: bool = False) -> Image.Image:
    """Recadre `layer` sur sa boîte englobante, la réduit pour que sa plus grande
    dimension fasse `target` px (et, si `circle`, pour qu'aucun pixel ne sorte du
    cercle de diamètre `target`) et la centre sur un canevas carré transparent."""
    alpha = np.array(layer)[:, :, 3]
    x0, y0, x1, y1 = bbox(alpha)
    crop = layer.crop((x0, y0, x1, y1))
    scale = target / max(crop.size)
    if circle:
        ys, xs = np.where(alpha > 0)
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        radius = float(np.sqrt((xs + 0.5 - cx) ** 2 + (ys + 0.5 - cy) ** 2).max())
        scale = min(scale, target / 2 / radius)
    new = (round(crop.width * scale), round(crop.height * scale))
    crop = crop.resize(new, Image.LANCZOS)  # Pillow rééchantillonne en alpha prémultiplié
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.paste(crop, ((size - new[0]) // 2, (size - new[1]) // 2))
    return canvas


def report(name: str, im: Image.Image) -> None:
    line = f"{name}: {im.size[0]}x{im.size[1]} {im.mode}"
    if im.mode == "RGBA":
        alpha = np.array(im)[:, :, 3]
        x0, y0, x1, y1 = bbox(alpha)
        w, h = x1 - x0, y1 - y0
        ys, xs = np.where(alpha > 0)
        c = im.size[0] / 2
        r = float(np.sqrt((xs + 0.5 - c) ** 2 + (ys + 0.5 - c) ** 2).max())
        dp = VIEWPORT_DP / im.size[0]
        line += (
            f" ; boîte englobante {w}x{h} px = {w * dp:.1f}x{h * dp:.1f} dp"
            f" (limite {SAFE_DP} dp sur {CANVAS_DP}) ; rayon max {r * dp:.1f} dp"
            f" (cercle de sécurité : {SAFE_DP / 2} dp)"
        )
    print(line)


def main() -> None:
    OUT.mkdir(exist_ok=True)

    fg = np.array(Image.open(SRC / "foreground.png").convert("RGBA"))
    alpha, removed = clean_alpha(fg[:, :, 3])
    print(f"foreground : {removed} px de poussière retirés, boîte {bbox(fg[:, :, 3])} -> {bbox(alpha)}")
    fg_clean = Image.fromarray(np.dstack([unpremultiply_from_white(fg[:, :, :3], alpha), alpha]), "RGBA")
    place(fg_clean, ICON, SAFE_PX, circle=True).save(OUT / "icon-foreground.png")

    mono = np.array(Image.open(SRC / "monochrome.png").convert("RGBA"))
    alpha, removed = clean_alpha(mono[:, :, 3])
    print(f"monochrome : {removed} px de poussière retirés, boîte {bbox(mono[:, :, 3])} -> {bbox(alpha)}")
    white = np.full(mono[:, :, :3].shape, 255, np.uint8)  # silhouette blanche, alpha seul
    place(Image.fromarray(np.dstack([white, alpha]), "RGBA"), ICON, SAFE_PX, circle=True).save(OUT / "icon-monochrome.png")

    Image.new("RGB", (ICON, ICON), PETROLE).save(OUT / "icon-background.png")

    flat = Image.new("RGBA", (ICON, ICON), PETROLE + (255,))
    flat.alpha_composite(place(fg_clean, ICON, round(ICON * FLAT_RATIO)))
    flat.convert("RGB").save(OUT / "icon-only.png")

    splash = Image.new("RGBA", (SPLASH, SPLASH), PETROLE + (255,))
    splash.alpha_composite(place(fg_clean, SPLASH, SPLASH_ILLU))
    splash.convert("RGB").save(OUT / "splash.png")
    splash.convert("RGB").save(OUT / "splash-dark.png")

    for name in ("icon-background", "icon-foreground", "icon-monochrome", "icon-only", "splash", "splash-dark"):
        report(name, Image.open(OUT / f"{name}.png"))


if __name__ == "__main__":
    main()
