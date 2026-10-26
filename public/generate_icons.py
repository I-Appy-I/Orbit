import os
import math
from PIL import Image, ImageDraw

def render_orbit_image(size=512):
    # Use 4x supersampling for ultra smooth vector-quality curves
    scale = 4
    s = size * scale
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Squircle background: corner radius ~ 22%
    radius = int(s * 0.22)
    bg_color = (108, 99, 232, 255) # #6c63e8
    draw.rounded_rectangle([0, 0, s - 1, s - 1], radius=radius, fill=bg_color)
    
    cx, cy = s / 2.0, s / 2.0
    factor = s / 141.0
    
    # Dimensions matched to the reference icon geometry
    r_orbit = 24.0 * factor
    w_orbit = int(round(4.6 * factor))
    
    bbox = [cx - r_orbit, cy - r_orbit, cx + r_orbit, cy + r_orbit]
    
    # Arcs:
    # Comp 2: from -41 deg (319 deg) clockwise to 104 deg
    # Comp 1: from 139 deg clockwise to 284 deg
    draw.arc(bbox, start=319, end=104, fill=(255, 255, 255, 255), width=w_orbit)
    draw.arc(bbox, start=139, end=284, fill=(255, 255, 255, 255), width=w_orbit)
    
    # Smooth rounded end caps for the arcs
    def draw_cap(angle_deg, r):
        rad = math.radians(angle_deg)
        x = cx + r * math.cos(rad)
        y = cy + r * math.sin(rad)
        cap_r = w_orbit / 2.0
        draw.ellipse([x - cap_r, y - cap_r, x + cap_r, y + cap_r], fill=(255, 255, 255, 255))
        
    draw_cap(104, r_orbit)
    draw_cap(284, r_orbit)
    
    # Satellite Rings
    r_sat = 4.8 * factor
    w_sat = 3.6 * factor
    out_r = r_sat + w_sat / 2.0
    in_r = r_sat - w_sat / 2.0
    
    for sat_angle in [-41, 139]:
        rad = math.radians(sat_angle)
        sx = cx + r_orbit * math.cos(rad)
        sy = cy + r_orbit * math.sin(rad)
        draw.ellipse([sx - out_r, sy - out_r, sx + out_r, sy + out_r], fill=(255, 255, 255, 255))
        draw.ellipse([sx - in_r, sy - in_r, sx + in_r, sy + in_r], fill=bg_color)
        
    # Central Planet Ring
    r_center = 7.5 * factor
    w_center = 4.6 * factor
    out_c = r_center + w_center / 2.0
    in_c = r_center - w_center / 2.0
    draw.ellipse([cx - out_c, cy - out_c, cx + out_c, cy + out_c], fill=(255, 255, 255, 255))
    draw.ellipse([cx - in_c, cy - in_c, cx + in_c, cy + in_c], fill=bg_color)
    
    # High-quality downsampling
    final_img = img.resize((size, size), Image.Resampling.LANCZOS)
    return final_img

# SVG Representation
SVG_TEMPLATE = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="112" ry="112" fill="#6C63E8"/>
  <path d="M 321.7 198.9 A 87.1 87.1 0 0 1 235.0 340.5" fill="none" stroke="#FFFFFF" stroke-width="17" stroke-linecap="round"/>
  <path d="M 190.3 313.1 A 87.1 87.1 0 0 1 277.0 171.5" fill="none" stroke="#FFFFFF" stroke-width="17" stroke-linecap="round"/>
  <circle cx="321.7" cy="198.9" r="17.4" fill="none" stroke="#FFFFFF" stroke-width="13"/>
  <circle cx="190.3" cy="313.1" r="17.4" fill="none" stroke="#FFFFFF" stroke-width="13"/>
  <circle cx="256" cy="256" r="27.2" fill="none" stroke="#FFFFFF" stroke-width="16.7"/>
</svg>"""

def main():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    public_dir = os.path.join(base_dir, "public")
    assets_dir = os.path.join(base_dir, "src", "assets")
    
    os.makedirs(public_dir, exist_ok=True)
    os.makedirs(assets_dir, exist_ok=True)
    
    # 1. Write SVG to public and assets
    svg_public = os.path.join(public_dir, "logo.svg")
    svg_assets = os.path.join(assets_dir, "logo.svg")
    with open(svg_public, "w", encoding="utf-8") as f:
        f.write(SVG_TEMPLATE)
    with open(svg_assets, "w", encoding="utf-8") as f:
        f.write(SVG_TEMPLATE)
    print(f"Wrote SVG to {svg_public} and {svg_assets}")
    
    # 2. Render 512x512
    img512 = render_orbit_image(512)
    p512 = os.path.join(public_dir, "logo512.png")
    img512.save(p512, "PNG")
    print(f"Saved {p512}")
    
    # 3. Render 192x192
    img192 = render_orbit_image(192)
    p192 = os.path.join(public_dir, "logo192.png")
    img192.save(p192, "PNG")
    print(f"Saved {p192}")
    
    # 4. Render apple-touch-icon / logo.png
    plogo = os.path.join(public_dir, "logo.png")
    img192.save(plogo, "PNG")
    print(f"Saved {plogo}")
    
    # 5. Render ICO files (multi-size: 16, 24, 32, 48, 64, 128, 256)
    ico_img = render_orbit_image(256)
    ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    
    favicon_path = os.path.join(public_dir, "favicon.ico")
    logo_ico_path = os.path.join(public_dir, "logo.ico")
    
    ico_img.save(favicon_path, format="ICO", sizes=ico_sizes)
    ico_img.save(logo_ico_path, format="ICO", sizes=ico_sizes)
    print(f"Saved ICO to {favicon_path} and {logo_ico_path}")

if __name__ == "__main__":
    main()
