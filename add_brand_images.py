import os, shutil
from PIL import Image
from playwright.sync_api import sync_playwright

output_dir = "VANI-B_IMGs"
os.makedirs(output_dir, exist_ok=True)

# 1. Copy Core Logos (Official V.A.N.I-xAI & Official Bureau Of V.A.N.I-xAI Logo)
core_logos = [
    ("svg.png", os.path.join(output_dir, "VANI_xAI_Vector_Icon.png")),
    ("svg.png", os.path.join(output_dir, "VANI_xAI_Official_Logo.png")),
    ("Bureau_Of_VANI_xAI_Official_Logo.png", os.path.join(output_dir, "Bureau_Of_VANI_xAI_Official_Logo.png")),
    ("Bureau_Of_VANI_xAI_Official_Logo.png", os.path.join(output_dir, "Bureau_Of_VANI_xAI_Official_Emblem.png")),
    ("Bureau_Of_VANI_xAI_Official_Logo.png", os.path.join(output_dir, "Bureau_Of_VANI_xAI_Master_Emblem.png")),
]

for src, dst in core_logos:
    if os.path.exists(src) and src != dst:
        shutil.copy2(src, dst)
        print(f"[COPIED LOGO] {src} -> {dst}")

# 2. Clean up any residual founder photos or brand banners
founder_hash = "a40286bcb1c2ed12bace3748be0c7d01"
import hashlib
for f in os.listdir(output_dir):
    p = os.path.join(output_dir, f)
    if "Banner" in f:
        try:
            os.remove(p)
            print(f"[REMOVED BANNER] {p}")
        except Exception:
            pass
    elif os.path.isfile(p):
        try:
            h = hashlib.md5(open(p, "rb").read()).hexdigest()
            if h == founder_hash:
                os.remove(p)
                print(f"[PURGED FOUNDER IMAGE] Removed: {p}")
        except Exception:
            pass

# 3. Generate Technical Infographic & Badge Assets via Playwright
def render_brand_assets():
    assets_html = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>VANI Technical Assets</title>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800;900&family=Rajdhani:wght@600;700;800&family=Fira+Code:wght@500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0B0F19; font-family: 'Outfit', sans-serif; color: #FFFFFF; }

  /* 1. System Architecture Infographic (1600x1200) */
  #architecture-infographic {
    width: 1600px;
    height: 1200px;
    background: #0F172A;
    padding: 60px;
    display: flex;
    flex-direction: column;
    position: relative;
    border: 2px solid #34D399;
  }
  .arch-header {
    text-align: center;
    margin-bottom: 40px;
  }
  .arch-header h2 {
    font-family: 'Rajdhani', sans-serif;
    font-size: 52px;
    color: #38BDF8;
    font-weight: 800;
  }
  .arch-header p {
    font-size: 20px;
    color: #94A3B8;
  }
  .arch-flow {
    display: grid;
    grid-template-columns: 1fr 60px 1fr 60px 1fr;
    align-items: center;
    margin-bottom: 40px;
  }
  .arch-arrow {
    text-align: center;
    font-size: 32px;
    color: #34D399;
  }
  .arch-node {
    background: #1E293B;
    border: 2px solid #38BDF8;
    border-radius: 18px;
    padding: 30px 24px;
    text-align: center;
    box-shadow: 0 10px 30px rgba(0,0,0,0.4);
  }
  .arch-node.green { border-color: #34D399; }
  .arch-node.gold { border-color: #FBBF24; }

  /* 2. Official Badge Emblem Sticker (1000x1000) */
  #badge-sticker {
    width: 1000px;
    height: 1000px;
    background: radial-gradient(circle, #1E293B 0%, #0B0F19 80%);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .badge-circle {
    width: 860px;
    height: 860px;
    border-radius: 50%;
    background: linear-gradient(135deg, #15203B, #0B0F19);
    border: 10px solid #38BDF8;
    box-shadow: 0 0 60px rgba(56, 189, 248, 0.4), inset 0 0 50px rgba(0,0,0,0.8);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px;
    text-align: center;
    position: relative;
  }
  .badge-circle::before {
    content: '';
    position: absolute;
    width: 820px;
    height: 820px;
    border-radius: 50%;
    border: 3px dashed #34D399;
  }
</style>
</head>
<body>

  <!-- ASSET 1: System Architecture Diagram Infographic -->
  <div id="architecture-infographic">
    <div class="arch-header">
      <div style="background: rgba(56, 189, 248, 0.15); border: 1.5px solid #38BDF8; color: #38BDF8; display: inline-block; padding: 6px 20px; border-radius: 20px; font-weight: 700; font-size: 15px; margin-bottom: 12px; text-transform: uppercase;">
        Applied Technological Pipeline
      </div>
      <h2>V.A.N.I-xAI Asymmetric Architecture</h2>
      <p>High-speed, zero-latency cloud inference powering ultra-lightweight client devices</p>
    </div>

    <div class="arch-flow">
      <div class="arch-node">
        <i class="fa-solid fa-mobile-screen" style="font-size: 48px; color: #38BDF8; margin-bottom: 15px;"></i>
        <h3 style="font-size: 22px; color: #FFFFFF; margin-bottom: 8px;">Client Layer (&lt;50KB)</h3>
        <p style="font-size: 15px; color: #94A3B8;">Runs on any legacy ₹5,000 phone or old school PC via standard browser.</p>
      </div>

      <div class="arch-arrow"><i class="fa-solid fa-arrow-right-long"></i></div>

      <div class="arch-node green">
        <i class="fa-solid fa-server" style="font-size: 48px; color: #34D399; margin-bottom: 15px;"></i>
        <h3 style="font-size: 22px; color: #FFFFFF; margin-bottom: 8px;">LLM Router & Memory</h3>
        <p style="font-size: 15px; color: #94A3B8;"><code>llm_router.py</code> with multi-model fallback & persistent <code>vani_memory.db</code>.</p>
      </div>

      <div class="arch-arrow"><i class="fa-solid fa-arrow-right-long"></i></div>

      <div class="arch-node gold">
        <i class="fa-solid fa-shield-halved" style="font-size: 48px; color: #FBBF24; margin-bottom: 15px;"></i>
        <h3 style="font-size: 22px; color: #FFFFFF; margin-bottom: 8px;">InAixVAi Dashboard</h3>
        <p style="font-size: 15px; color: #94A3B8;">Teacher/admin classroom oversight, token security & multi-device swarm sync.</p>
      </div>
    </div>

    <div style="background: #1E293B; border-radius: 16px; padding: 25px 35px; border-left: 6px solid #34D399; margin-top: auto; display: flex; justify-content: space-between; align-items: center;">
      <div>
        <h4 style="font-size: 20px; color: #34D399; margin-bottom: 4px;">Innovator: Dhruv Sagar (Class 10th)</h4>
        <p style="font-size: 15px; color: #94A3B8; margin: 0;">PM SHRI KV NO.1 AFS Chakeri Kanpur &bull; Dept. of Science & Technology (DST) / NIF India</p>
      </div>
      <div style="font-size: 24px; font-weight: 800; color: #FBBF24;">
        100% Zero Subscriptions
      </div>
    </div>
  </div>

  <!-- ASSET 2: Official Badge Emblem Sticker -->
  <div id="badge-sticker">
    <div class="badge-circle">
      <div style="font-size: 22px; font-weight: 800; color: #FBBF24; letter-spacing: 2px; margin-bottom: 12px;">
        ★ BUREAU OF V.A.N.I - xAI ★
      </div>
      <div style="font-family: 'Rajdhani', sans-serif; font-size: 64px; font-weight: 900; color: #38BDF8; letter-spacing: 2px; margin-bottom: 6px;">
        V.A.N.I - xAI
      </div>
      <div style="font-size: 26px; font-weight: 700; color: #34D399; margin-bottom: 20px;">
        BoVxAi SOVEREIGN AI
      </div>
      <div style="font-size: 18px; color: #E2E8F0; max-width: 600px; line-height: 1.5; margin-bottom: 30px;">
        Vāṇī Adhyātmik Navīn Intellect<br>
        100% Free &bull; Zero E-Waste &bull; Socratic Mentorship
      </div>
      <div style="background: rgba(56, 189, 248, 0.15); border: 2px solid #38BDF8; color: #38BDF8; font-weight: 800; font-size: 16px; padding: 10px 30px; border-radius: 30px; letter-spacing: 1px;">
        NATIONAL CHILDREN'S SCIENCE CONGRESS (NCSC) 2026-27
      </div>
    </div>
  </div>

</body>
</html>
"""
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 2000, "height": 2000}, device_scale_factor=2)
        page.set_content(assets_html, wait_until="networkidle")

        # Capture Infographic
        info_el = page.query_selector("#architecture-infographic")
        info_path = os.path.join(output_dir, "VANI_xAI_System_Architecture_Infographic.png")
        info_el.screenshot(path=info_path)
        print(f"[GENERATED] {info_path}")

        # Capture Sticker Badge
        badge_el = page.query_selector("#badge-sticker")
        badge_path = os.path.join(output_dir, "Bureau_Of_VANI_xAI_Emblem_Badge.png")
        badge_el.screenshot(path=badge_path)
        print(f"[GENERATED] {badge_path}")

        browser.close()

if __name__ == "__main__":
    render_brand_assets()
    print("[ALL DONE] Brand assets updated (brand banner removed)!")
