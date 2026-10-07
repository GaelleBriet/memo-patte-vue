"""annotate.py capture.png sortie.webp "x y w h" ... : encadre et numérote des zones (px CSS) d'une capture d'émulateur."""
import subprocess
import sys

DPR, WEBVIEW_TOP, WEBVIEW_HEIGHT, COLOR = 2.625, 126, 2210, '#E8833A'

source, output, boxes = sys.argv[1], sys.argv[2], sys.argv[3:]
draw = []
for number, box in enumerate(boxes, 1):
    x, y, w, h = map(float, box.split())
    x0, y0 = round((x - 4) * DPR), round((y + 4) * DPR + WEBVIEW_TOP)
    x1, y1 = round((x + w + 4) * DPR), round((y + h - 4) * DPR + WEBVIEW_TOP)
    draw += ['-fill', 'none', '-stroke', COLOR, '-strokewidth', '9',
             '-draw', f'roundrectangle {x0},{y0} {x1},{y1} 30,30']
    if len(boxes) > 1:
        cx, cy = x1 - 55, y0 + 5
        draw += ['-fill', COLOR, '-stroke', 'white', '-strokewidth', '5',
                 '-draw', f'circle {cx},{cy} {cx + 40},{cy}', '-stroke', 'none', '-fill', 'white',
                 '-font', 'DejaVu-Sans-Bold', '-pointsize', '50', '-gravity', 'NorthWest',
                 '-annotate', f'+{cx - 15}+{cy - 28}', str(number)]
subprocess.run(['magick', source, *draw, '-gravity', 'NorthWest',
                '-crop', f'1080x{WEBVIEW_HEIGHT}+0+{WEBVIEW_TOP}', '+repage',
                '-resize', '540x', '-quality', '82', output], check=True)
