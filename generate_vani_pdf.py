import os, base64
from playwright.sync_api import sync_playwright

def get_file_base64(filepath):
    if os.path.exists(filepath):
        ext = os.path.splitext(filepath)[1].lower()
        mime = "image/png" if ext == ".png" else "image/jpeg"
        with open(filepath, "rb") as f:
            return f"data:{mime};base64," + base64.b64encode(f.read()).decode("utf-8")
    return ""

def get_bureau_logo_b64():
    path = os.path.join("VANI-B_IMGs", "Bureau_Of_VANI_xAI_Official_Logo.png")
    if not os.path.exists(path):
        path = "ChatGPT Image Aug 6, 2026, 02_34_11 PM.png"
    return get_file_base64(path)

def get_vani_logo_b64():
    path = os.path.join("VANI-B_IMGs", "VANI_xAI_Vector_Icon.png")
    if not os.path.exists(path):
        path = "svg.png"
    return get_file_base64(path)

def generate_portrait_presentation_doc():
    bureau_logo_b64 = get_bureau_logo_b64()
    vani_logo_b64 = get_vani_logo_b64()
    
    doc_html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>V.A.N.I-xAI (BoVxAi) - National Children's Science Congress (NCSC) Presentation</title>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=Rajdhani:wght@500;600;700;800&family=Fira+Code:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
<style>
  @page {{
    size: A4 portrait;
    margin: 12mm 13mm 12mm 13mm;
    @bottom-right {{
      content: "Page " counter(page);
    }}
  }}
  * {{
    box-sizing: border-box;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }}
  body {{
    font-family: 'Outfit', sans-serif;
    color: #1E293B;
    line-height: 1.5;
    margin: 0;
    padding: 0;
    font-size: 12.5px;
    background: #FFFFFF;
  }}

  .page-container {{
    page-break-after: always;
    min-height: 980px;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    position: relative;
    padding-bottom: 15px;
  }}
  .page-container:last-child {{
    page-break-after: avoid;
  }}

  /* Master Dark Hero Card with Dual Official Logos (Bureau of VANI-xAI & VANI-xAI) */
  .hero-card {{
    background: linear-gradient(135deg, #0B0F19 0%, #1A2438 100%);
    color: #FFFFFF;
    border-radius: 12px;
    padding: 16px 20px;
    margin-bottom: 14px;
    border-left: 6px solid #38BDF8;
    box-shadow: 0 8px 25px rgba(11, 15, 25, 0.12);
    display: flex;
    align-items: center;
    gap: 16px;
  }}
  .hero-text-side {{
    flex: 1;
  }}
  .hero-logos-container {{
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
  }}
  .hero-logo-box {{
    width: 110px;
    height: 110px;
    background: #FFFFFF;
    border-radius: 10px;
    padding: 5px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 15px rgba(0,0,0,0.3);
  }}
  .hero-logo-img {{
    width: 100%;
    height: 100%;
    object-fit: contain;
  }}

  .header-badge {{
    display: inline-block;
    background: #FBBF24;
    color: #0B0F19;
    font-size: 10.5px;
    font-weight: 800;
    padding: 3px 10px;
    border-radius: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 5px;
  }}
  h1.project-title {{
    font-family: 'Rajdhani', sans-serif;
    font-size: 28px;
    font-weight: 800;
    color: #38BDF8;
    margin: 0 0 2px 0;
    letter-spacing: 0.5px;
  }}
  .project-subtitle {{
    font-size: 14.5px;
    color: #34D399;
    font-weight: 700;
    margin: 0 0 5px 0;
  }}
  .project-desc {{
    font-size: 11.5px;
    color: #E2E8F0;
    line-height: 1.4;
    margin: 0;
  }}

  /* Section Headings */
  h2.section-heading {{
    font-family: 'Rajdhani', sans-serif;
    font-size: 18px;
    font-weight: 700;
    color: #0F172A;
    border-bottom: 2px solid #0284C7;
    padding-bottom: 3px;
    margin-top: 12px;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 8px;
  }}
  h2.section-heading.green {{ border-color: #16A34A; }}
  h2.section-heading.gold {{ border-color: #D97706; }}
  h2.section-heading.purple {{ border-color: #9333EA; }}
  h2.section-heading.red {{ border-color: #DC2626; }}

  /* Grid Layouts */
  .grid-2 {{
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-gap: 10px;
    margin-bottom: 10px;
  }}
  .grid-3 {{
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    grid-gap: 10px;
    margin-bottom: 10px;
  }}
  .grid-4 {{
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    grid-gap: 8px;
    margin-bottom: 10px;
  }}

  /* Cards */
  .card-box {{
    background: #FFFFFF;
    border: 1px solid #E2E8F0;
    border-radius: 9px;
    padding: 10px 12px;
    box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
  }}
  .card-box.blue {{ border-left: 4px solid #0284C7; }}
  .card-box.green {{ border-left: 4px solid #16A34A; }}
  .card-box.gold {{ border-left: 4px solid #D97706; }}
  .card-box.purple {{ border-left: 4px solid #9333EA; }}
  .card-box.red {{ border-left: 4px solid #DC2626; }}

  .card-title {{
    font-weight: 700;
    font-size: 13px;
    color: #0F172A;
    margin-bottom: 3px;
    display: flex;
    align-items: center;
    gap: 6px;
  }}
  .card-desc {{
    font-size: 11.5px;
    color: #334155;
    line-height: 1.45;
  }}
  .card-desc code {{
    font-family: 'Fira Code', monospace;
    background: #F1F5F9;
    padding: 1px 4px;
    border-radius: 3px;
    color: #0284C7;
    font-size: 10.5px;
  }}

  /* Highlight Callout Boxes */
  .box-callout {{
    background: #F0F9FF;
    border: 1px solid #BAE6FD;
    border-left: 4px solid #0284C7;
    border-radius: 8px;
    padding: 9px 12px;
    margin-bottom: 8px;
    font-size: 12px;
    color: #0C4A6E;
  }}
  .box-callout.green {{
    background: #F0FDF4;
    border-color: #BBF7D0;
    border-left-color: #16A34A;
    color: #14532D;
  }}
  .box-callout.amber {{
    background: #FFFBEB;
    border-color: #FDE68A;
    border-left-color: #D97706;
    color: #78350F;
  }}

  /* Tables */
  table.data-table {{
    width: 100%;
    border-collapse: collapse;
    margin: 8px 0 10px 0;
    font-size: 11px;
    border: 1px solid #E2E8F0;
    border-radius: 8px;
    overflow: hidden;
  }}
  table.data-table th {{
    background: #0F172A;
    color: #FFFFFF;
    padding: 7px 9px;
    text-align: left;
    font-weight: 600;
  }}
  table.data-table th.highlight-col {{
    background: #0284C7;
  }}
  table.data-table td {{
    padding: 6px 9px;
    border-bottom: 1px solid #E2E8F0;
    color: #334155;
  }}
  table.data-table tr:nth-child(even) td {{
    background: #F8FAFC;
  }}
  table.data-table td.feature-title {{
    font-weight: 700;
    color: #0F172A;
  }}
  table.data-table td.highlight-cell {{
    font-weight: 700;
    color: #16A34A;
    background: #F0FDF4;
  }}

  /* Step Flow in Portrait */
  .step-flow-portrait {{
    display: flex;
    flex-direction: column;
    gap: 7px;
    margin: 8px 0;
  }}
  .step-item {{
    display: flex;
    align-items: flex-start;
    gap: 10px;
    background: #FFFFFF;
    border: 1px solid #E2E8F0;
    border-radius: 7px;
    padding: 8px 12px;
  }}
  .step-badge {{
    background: #0284C7;
    color: #FFFFFF;
    font-weight: 800;
    font-size: 10.5px;
    padding: 2px 7px;
    border-radius: 5px;
    white-space: nowrap;
    margin-top: 1px;
  }}
  .step-content {{
    flex-grow: 1;
  }}
  .step-title {{
    font-weight: 700;
    font-size: 12.5px;
    color: #0F172A;
    margin-bottom: 1px;
  }}
  .step-desc {{
    font-size: 11.5px;
    color: #475569;
  }}

  /* 4 Pillars Grid Badge */
  .pillars-badge-grid {{
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    grid-gap: 8px;
    margin-top: 8px;
    margin-bottom: 10px;
  }}
  .pillar-pill {{
    background: #F8FAFC;
    border: 1px solid #CBD5E1;
    border-radius: 6px;
    padding: 6px 8px;
    text-align: center;
  }}
  .pillar-pill-title {{
    font-weight: 800;
    font-size: 11px;
    color: #0F172A;
    text-transform: uppercase;
  }}
  .pillar-pill-sub {{
    font-size: 10px;
    color: #64748B;
  }}

  /* Page Footer */
  .page-footer {{
    margin-top: auto;
    border-top: 1px solid #E2E8F0;
    padding-top: 6px;
    font-size: 10px;
    color: #64748B;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }}
</style>
</head>
<body>

  <!-- ========================================================================= -->
  <!-- PAGE 1: Master Title, Official Logo & Executive Summary -->
  <!-- ========================================================================= -->
  <div class="page-container">
    <div class="hero-card">
      <div class="hero-text-side">
        <div class="header-badge">🏆 NATIONAL CHILDREN'S SCIENCE CONGRESS (NCSC) 2026-27</div>
        <h1 class="project-title">V.A.N.I - xAI (BoVxAi)</h1>
        <div class="project-subtitle">Vāṇī Adhyātmik Navīn Intellect & Bridge of Voice</div>
        <p class="project-desc">
          Next-Generation 100% Free Sovereign AI Tutoring, Multimodal Voice & Autonomous Learning Ecosystem for Bharat
        </p>
      </div>
      <div class="hero-logos-container">
        <div class="hero-logo-box" style="width: 135px; height: 135px;" title="Bureau of V.A.N.I-xAI Official Logo">
          <img src="{vani_logo_b64}" class="hero-logo-img" alt="Bureau of VANI-xAI Official Logo">
        </div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card-box blue">
        <div class="card-title" style="color: #0284C7; font-size: 13.5px;">
          <i class="fa-solid fa-user-graduate"></i> Innovator Profile
        </div>
        <div class="card-desc" style="line-height: 1.55;">
          <div>• <strong>Student Name:</strong> Dhruv Sagar (Class 10th - Secondary)</div>
          <div>• <strong>Institution:</strong> PM SHRI KV NO.1 AFS Chakeri, Kanpur</div>
          <div>• <strong>Region:</strong> Uttar Pradesh, India (KVS RO Varanasi)</div>
          <div>• <strong>Authority:</strong> Dept. of Science & Technology (DST) / NIF India</div>
        </div>
      </div>

      <div class="card-box green">
        <div class="card-title" style="color: #16A34A; font-size: 13.5px;">
          <i class="fa-solid fa-cube"></i> Project Key Attributes
        </div>
        <div class="card-desc" style="line-height: 1.55;">
          <div>• <strong>Domain:</strong> Information Technology / Applied Artificial Intelligence</div>
          <div>• <strong>Accessibility Model:</strong> 100% Free Sovereign AI (Zero Subscriptions)</div>
          <div>• <strong>Architecture:</strong> Asymmetric Sub-User Engine (&lt;50KB Client)</div>
          <div>• <strong>Sustainability:</strong> 100% Zero E-Waste & Zero Plastic Hardware</div>
        </div>
      </div>
    </div>

    <h2 class="section-heading"><i class="fa-solid fa-feather"></i> 1. Executive Abstract</h2>
    <p style="text-align: justify; margin-bottom: 6px;">
      <strong>V.A.N.I-xAI (BoVxAi)</strong> is an indigenous, cloud-native Artificial Intelligence tutoring ecosystem engineered from first principles under the <strong>Bureau of V.A.N.I-xAI</strong> to democratize world-class digital learning across Bharat. While commercial AI platforms mandate expensive recurring subscriptions (₹1,500 to ₹2,500/month) and heavy GPU hardware, V.A.N.I-xAI delivers <strong>100% Free Lifetime Sovereign AI Mentorship</strong> with zero subscriptions, zero paywalls, and instant browser accessibility.
    </p>

    <div class="box-callout green">
      <strong>Core Breakthrough:</strong> Shifting 99% of computation to optimized cloud infrastructure reduces the client footprint to under 50KB, enabling instant sub-second boot times on legacy ₹5,000 mobile phones and slow 2G/3G connections in Tier-2, Tier-3, and rural Indian schools.
    </div>

    <div class="grid-3" style="margin-top: 6px;">
      <div class="card-box" style="text-align: center; background: #F0FDF4; border-color: #BBF7D0;">
        <div style="font-size: 18px; font-weight: 800; color: #16A34A;">₹0 Cost</div>
        <div style="font-size: 10.5px; color: #15803D; font-weight: 600;">Zero Subscriptions / 100% Free</div>
      </div>
      <div class="card-box" style="text-align: center; background: #F0F9FF; border-color: #BAE6FD;">
        <div style="font-size: 18px; font-weight: 800; color: #0284C7;">&lt; 50 KB</div>
        <div style="font-size: 10.5px; color: #0369A1; font-weight: 600;">Client Web Payload Size</div>
      </div>
      <div class="card-box" style="text-align: center; background: #FFFBEB; border-color: #FDE68A;">
        <div style="font-size: 18px; font-weight: 800; color: #D97706;">0 E-Waste</div>
        <div style="font-size: 10.5px; color: #B45309; font-weight: 600;">100% Software Architecture</div>
      </div>
    </div>

    <div class="page-footer">
      <span>Bureau of V.A.N.I-xAI &bull; National Children's Science Congress (NCSC)</span>
      <span>PM SHRI KV NO.1 AFS Chakeri Kanpur</span>
    </div>
  </div>

  <!-- ========================================================================= -->
  <!-- PAGE 2: Grassroots Problem Statement & Socratic Innovation -->
  <!-- ========================================================================= -->
  <div class="page-container">
    <h2 class="section-heading red"><i class="fa-solid fa-triangle-exclamation"></i> 2. Grassroots Problem Statement</h2>
    <div class="grid-2">
      <div class="card-box gold">
        <div class="card-title" style="color: #D97706;"><i class="fa-solid fa-money-bill-wave"></i> Severe Economic Exclusivity & Paywalls</div>
        <div class="card-desc">Commercial AI platforms (ChatGPT Plus, Claude Pro) charge ₹1,500–₹2,500/month and mandate recurring subscriptions, shutting out millions of underprivileged Indian students behind paywalls.</div>
      </div>
      <div class="card-box blue">
        <div class="card-title" style="color: #0284C7;"><i class="fa-solid fa-mobile-screen"></i> Hardware & Low-Bandwidth Barrier</div>
        <div class="card-desc">Advanced generative models demand high-end GPUs, modern phones, and heavy app downloads. Students using ₹5,000 phones and 2G/3G mobile data cannot run heavy AI applications.</div>
      </div>
      <div class="card-box red">
        <div class="card-title" style="color: #DC2626;"><i class="fa-solid fa-brain"></i> The "Cheat-Engine" Pedagogical Flaw</div>
        <div class="card-desc">Mainstream LLMs generate direct solutions without explanations, encouraging rote copy-pasting and academic cheating rather than cognitive reasoning, critical inquiry, or conceptual mastery.</div>
      </div>
      <div class="card-box purple">
        <div class="card-title" style="color: #9333EA;"><i class="fa-solid fa-shield-virus"></i> Lack of Localized Safety & Guardrails</div>
        <div class="card-desc">Foreign AI platforms lack alignment with Indian NCERT/CBSE curricula, vernacular voice capabilities, and youth-safe ethical guardrails tailored for Indian school children.</div>
      </div>
    </div>

    <h2 class="section-heading green"><i class="fa-solid fa-lightbulb"></i> 3. The Proposed Innovation: V.A.N.I-xAI Solution</h2>
    <div class="grid-2">
      <div class="card-box blue">
        <div class="card-title" style="color: #0284C7;">01. ⚡ Asymmetric Sub-User Core</div>
        <div class="card-desc">99% of computation is shifted to high-speed cloud clusters. The web client payload is &lt;50KB, allowing instant sub-second boot times even on legacy phones and slow networks.</div>
      </div>
      <div class="card-box green">
        <div class="card-title" style="color: #16A34A;">02. 🎓 Socratic Mentorship Engine</div>
        <div class="card-desc">Instead of feeding raw answers, the model acts as an empathetic digital mentor—breaking complex STEM concepts into guided hints, interactive questioning, and conceptual scaffolding.</div>
      </div>
      <div class="card-box purple">
        <div class="card-title" style="color: #9333EA;">03. 🎙️ BoV Multimodal Voice Hub</div>
        <div class="card-desc">Integrated speech synthesis and voice processing (<code>voice_agent.py</code>) enables real-time auditory explanations for students with reading difficulties or vernacular preferences.</div>
      </div>
      <div class="card-box gold">
        <div class="card-title" style="color: #D97706;">04. 🔓 100% Free Sovereign Access</div>
        <div class="card-desc">Completely eliminated all premium subscription plans and paywalls. Every feature is 100% free and unlocked forever with instant Google OAuth and mathematical UID keys.</div>
      </div>
    </div>

    <div class="box-callout amber">
      <strong>Pedagogical Integrity:</strong> Aligned with National Education Policy (NEP 2020) principles to transition students from passive memorization to active inquiry-driven problem solving.
    </div>

    <div class="page-footer">
      <span>Bureau of V.A.N.I-xAI &bull; National Children's Science Congress (NCSC)</span>
      <span>PM SHRI KV NO.1 AFS Chakeri Kanpur</span>
    </div>
  </div>

  <!-- ========================================================================= -->
  <!-- PAGE 3: 4 Architectural Pillars & BoVxAi Autonomous AI Modules -->
  <!-- ========================================================================= -->
  <div class="page-container">
    <h2 class="section-heading gold"><i class="fa-solid fa-award"></i> 4. Scientific Novelty & 4 Architectural Pillars</h2>
    <div class="grid-2">
      <div class="card-box blue">
        <div class="card-title" style="color: #0284C7;">1. Mathematical UID Generation</div>
        <div class="card-desc">Algorithmically generates permanent user-bound tokens (e.g., <code>V.A.N.I-xAI-DHRU-3478</code>) upon Google OAuth sign-in, binding persistent workspace state and memory recall to verified student identities without hardware lock-in.</div>
      </div>
      <div class="card-box green">
        <div class="card-title" style="color: #16A34A;">2. 3-Layer Cryptographic Security</div>
        <div class="card-desc">Proprietary algorithmic authorization validated against 3 rigorous integrity checks: (1) Database Existence, (2) Active Student Token validation, and (3) Strict UID binding to eliminate impersonation.</div>
      </div>
      <div class="card-box gold">
        <div class="card-title" style="color: #D97706;">3. InAixVAi Command Dashboard</div>
        <div class="card-desc">A bespoke educator/admin dashboard enabling real-time multi-user telemetry, classroom activity monitoring, query load oversight, and platform integrity management with zero subscription barriers.</div>
      </div>
      <div class="card-box purple">
        <div class="card-title" style="color: #9333EA;">4. Autonomous Session & Memory Protocol</div>
        <div class="card-desc">An autonomous background self-healing engine that manages real-time cross-device session synchronization, SQLite memory persistence (<code>vani_memory.db</code>), and load-balancing with zero maintenance.</div>
      </div>
    </div>

    <h2 class="section-heading"><i class="fa-solid fa-robot"></i> 5. BoVxAi Applied AI Capabilities & Multi-Agent Loop</h2>
    <div class="grid-2">
      <div class="card-box blue">
        <div class="card-title" style="color: #0284C7;"><i class="fa-solid fa-database"></i> LLM Router & SQLite Memory</div>
        <div class="card-desc">Features <code>llm_router.py</code> with multi-model fallback across vision and text models. Backed by <code>vani_memory.db</code> for persistent conversational memory, contextual recall, and fast semantic search.</div>
      </div>
      <div class="card-box green">
        <div class="card-title" style="color: #16A34A;"><i class="fa-solid fa-headphones-simple"></i> Multimodal Voice Engine</div>
        <div class="card-desc">Powered by <code>voice_agent.py</code> and edge TTS. Converts complex scientific derivations and explanations into natural audio speech for inclusive hands-free learning.</div>
      </div>
      <div class="card-box gold">
        <div class="card-title" style="color: #D97706;"><i class="fa-solid fa-eye"></i> Vision-Guided Agentic Loop</div>
        <div class="card-desc"><code>agentic_loop.py</code> utilizes visual reasoning to analyze user screen states, coordinates, and automated workflows, transforming V.A.N.I into an interactive digital lab assistant.</div>
      </div>
      <div class="card-box purple">
        <div class="card-title" style="color: #9333EA;"><i class="fa-solid fa-network-wired"></i> Proactive System Agent</div>
        <div class="card-desc"><code>autonomous_agent.py</code> monitors real-time battery status, initiates power-saving protocols, and schedules automated learning routines for student productivity.</div>
      </div>
    </div>

    <div class="page-footer">
      <span>Bureau of V.A.N.I-xAI &bull; National Children's Science Congress (NCSC)</span>
      <span>PM SHRI KV NO.1 AFS Chakeri Kanpur</span>
    </div>
  </div>

  <!-- ========================================================================= -->
  <!-- PAGE 4: 5-Step Pipeline & Comparative Benchmarking -->
  <!-- ========================================================================= -->
  <div class="page-container">
    <h2 class="section-heading green"><i class="fa-solid fa-shoe-prints"></i> 6. End-to-End Operational Pipeline</h2>
    <div class="step-flow-portrait">
      <div class="step-item">
        <div class="step-badge">STEP 1</div>
        <div class="step-content">
          <div class="step-title">Authentication & Mathematical UID Generation</div>
          <div class="step-desc">Student signs in securely via Google OAuth. System algorithmically computes and permanently assigns their unique V.A.N.I UID.</div>
        </div>
      </div>
      <div class="step-item">
        <div class="step-badge" style="background: #16A34A;">STEP 2</div>
        <div class="step-content">
          <div class="step-title">Instant Free Sovereign Access (Zero Paywalls)</div>
          <div class="step-desc">Student enters workspace with 100% unlocked features, zero subscription friction, zero fees, and instant workspace launch.</div>
        </div>
      </div>
      <div class="step-item">
        <div class="step-badge" style="background: #D97706;">STEP 3</div>
        <div class="step-content">
          <div class="step-title">Security Binding & Swarm Synchronization</div>
          <div class="step-desc">System cryptographically binds UID with secure session tokens, enabling instant cross-device pairing and encrypted memory persistence.</div>
        </div>
      </div>
      <div class="step-item">
        <div class="step-badge" style="background: #9333EA;">STEP 4</div>
        <div class="step-content">
          <div class="step-title">Socratic AI Inference & Voice Synthesis</div>
          <div class="step-desc">Queries route through the LLM router, memory database, and Socratic safety filters for guided step-by-step tutoring.</div>
        </div>
      </div>
      <div class="step-item">
        <div class="step-badge">STEP 5</div>
        <div class="step-content">
          <div class="step-title">Persistent Memory & Lifelong Learning Mastery</div>
          <div class="step-desc">Autonomous memory engine continuously stores learning milestones, voice history, and concept mastery for lifelong growth.</div>
        </div>
      </div>
    </div>

    <h2 class="section-heading gold"><i class="fa-solid fa-scale-balanced"></i> 7. Competitive Benchmarking Matrix</h2>
    <table class="data-table">
      <thead>
        <tr>
          <th style="width: 25%;">Evaluation Metric</th>
          <th style="width: 25%;">Commercial AI (ChatGPT/Claude)</th>
          <th style="width: 25%;">Traditional EdTech Apps</th>
          <th class="highlight-col" style="width: 25%;"><i class="fa-solid fa-trophy"></i> V.A.N.I - xAI (Our Innovation)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="feature-title">Cost for Students</td>
          <td>₹1,500 - ₹2,500/month (Expensive)</td>
          <td>₹5,000 - ₹25,000/year (High cost)</td>
          <td class="highlight-cell">100% Free Lifetime (Zero Subscriptions)</td>
        </tr>
        <tr>
          <td class="feature-title">Hardware Barrier</td>
          <td>Requires modern smartphone & RAM</td>
          <td>Requires 100MB+ app download</td>
          <td class="highlight-cell">Runs on any browser / &lt;50KB payload</td>
        </tr>
        <tr>
          <td class="feature-title">Pedagogical Approach</td>
          <td>Direct answer generation (cheat)</td>
          <td>Static recorded video lectures</td>
          <td class="highlight-cell">Socratic guidance & Concept scaffolding</td>
        </tr>
        <tr>
          <td class="feature-title">Payment Barrier</td>
          <td>Mandates International Credit Cards</td>
          <td>Closed recurring subscriptions</td>
          <td class="highlight-cell">Zero Paywalls / Instant Free Access</td>
        </tr>
        <tr>
          <td class="feature-title">Zero E-Waste & Ecology</td>
          <td>Heavy local battery & GPU drain</td>
          <td>Proprietary locked tablet hardware</td>
          <td class="highlight-cell">100% Cloud-Native (Zero E-Waste)</td>
        </tr>
      </tbody>
    </table>

    <div class="page-footer">
      <span>Bureau of V.A.N.I-xAI &bull; National Children's Science Congress (NCSC)</span>
      <span>PM SHRI KV NO.1 AFS Chakeri Kanpur</span>
    </div>
  </div>

  <!-- ========================================================================= -->
  <!-- PAGE 5: Societal Impact, DBT Budget, Roadmap & Official Conclusion -->
  <!-- ========================================================================= -->
  <div class="page-container">
    <h2 class="section-heading green"><i class="fa-solid fa-handshake-angle"></i> 8. Societal Impact & DBT ₹10,000 Budget Plan</h2>
    <div class="grid-2">
      <div class="card-box blue">
        <div class="card-title" style="color: #0284C7;"><i class="fa-solid fa-seedling"></i> 100% Zero E-Waste</div>
        <div class="card-desc">
          • Zero physical plastic casing, toxic batteries, or PCB manufacturing.<br>
          • Repurposes existing school lab computers & parents' low-cost smartphones.<br>
          • Eco-friendly, completely paperless, and sustainable digital architecture.
        </div>
      </div>
      <div class="card-box green">
        <div class="card-title" style="color: #16A34A;"><i class="fa-solid fa-people-roof"></i> Grassroots Empowerment</div>
        <div class="card-desc">
          • Delivers 24/7 personalized 1-on-1 STEM mentoring with zero fees.<br>
          • Empowers first-generation learners in Science, Math, and Coding.<br>
          • Directly bridges the metropolitan vs rural digital educational divide.
        </div>
      </div>
    </div>

    <table class="data-table">
      <thead>
        <tr>
          <th>Budget Allocation</th>
          <th>Amount (₹)</th>
          <th>Direct Educational Deliverable</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Cloud API Inference Pool</td>
          <td>₹5,000</td>
          <td>Empowers 100,000+ Socratic STEM queries at zero cost to students.</td>
        </tr>
        <tr>
          <td>Serverless DB & Indian Edge CDN</td>
          <td>₹2,500</td>
          <td>Sub-50ms latency across rural UP, Bihar, and regional school clusters.</td>
        </tr>
        <tr>
          <td>Vernacular Token Optimization</td>
          <td>₹1,500</td>
          <td>Fine-tuning token efficiency for Hindi and regional Indian dialects.</td>
        </tr>
        <tr>
          <td>SSL Security & Cluster Deployment</td>
          <td>₹1,000</td>
          <td>Automated security certificates and multi-school classroom provisioning.</td>
        </tr>
        <tr style="background: #F0F9FF; font-weight: 700;">
          <td>Total Resource Scaling Budget</td>
          <td>₹10,000</td>
          <td>100% Utilized to empower thousands of underprivileged students.</td>
        </tr>
      </tbody>
    </table>

    <h2 class="section-heading gold"><i class="fa-solid fa-rocket"></i> 9. Future Roadmap & Scaling</h2>
    <div class="grid-3">
      <div class="card-box blue">
        <div class="card-title" style="color: #0284C7; font-size: 12px;">Phase 1: School Level (2026)</div>
        <div class="card-desc">Deployed 100% Free prototype at PM SHRI KV No. 1 AFS Chakeri; Socratic AI engine, BoV voice hub, and InAixVAi teacher dashboard operational.</div>
      </div>
      <div class="card-box green">
        <div class="card-title" style="color: #16A34A; font-size: 12px;">Phase 2: District & State Level</div>
        <div class="card-desc">Scaling to 10+ regional Indian languages; bidirectional speech synthesis; offline mesh edge caching for remote village schools.</div>
      </div>
      <div class="card-box gold">
        <div class="card-title" style="color: #D97706; font-size: 12px;">Phase 3: National Level</div>
        <div class="card-desc">Integration with DIKSHA / PM eVidya platforms, AI virtual science lab simulations, and nationwide public digital utility rollout.</div>
      </div>
    </div>

    <!-- Official Conclusion Banner with Official Logo -->
    <div class="hero-card" style="padding: 12px 16px; margin-top: 8px; margin-bottom: 0; display: flex; align-items: center; gap: 14px;">
      <div class="hero-logos-container">
        <div style="width: 60px; height: 60px; background: #FFFFFF; border-radius: 8px; padding: 4px; display: flex; align-items: center; justify-content: center;">
          <img src="{vani_logo_b64}" style="width: 100%; height: 100%; object-fit: contain;" alt="Bureau of VANI-xAI Official Logo">
        </div>
      </div>
      <div style="flex: 1; text-align: left;">
        <div style="font-size: 14px; font-weight: 700; color: #38BDF8;">
          Thank You, Respected Jury Members! &bull; Bureau of V.A.N.I-xAI
        </div>
        <div style="font-size: 11px; color: #F8FAFC; line-height: 1.4;">
          "Democratizing cutting-edge AI mentorship for every student in every corner of India — 100% Free, Zero Subscriptions, Zero E-Waste & Grounded in Scientific Integrity."
        </div>
        <div style="font-size: 10px; color: #CBD5E1; margin-top: 2px; border-top: 1px solid rgba(255, 255, 255, 0.15); padding-top: 2px;">
          <strong>Innovator:</strong> Dhruv Sagar (Class 10th) &bull; PM SHRI KV NO.1 AFS Chakeri, Kanpur (UP) &bull; NCSTC / DST India
        </div>
      </div>
    </div>

    <div class="page-footer">
      <span>Bureau of V.A.N.I-xAI &bull; National Children's Science Congress (NCSC)</span>
      <span>PM SHRI KV NO.1 AFS Chakeri Kanpur</span>
    </div>
  </div>

</body>
</html>
"""
    return doc_html


def generate_pdfs_and_images():
    print("[INFO] Launching Playwright to generate Portrait PDF & Image artifacts with Dual Official Logos (Bureau of VANI-xAI & VANI-xAI)...")
    output_img_dir = "VANI-B_IMGs"
    os.makedirs(output_img_dir, exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch()

        # 1. Generate VANI-xAi_IM_BoVxAi.pdf with Dual Logos
        page1 = browser.new_page()
        page1.set_content(generate_portrait_presentation_doc(), wait_until="networkidle")
        output_portrait_pdf = "VANI-xAi_IM_BoVxAi.pdf"
        page1.pdf(
            path=output_portrait_pdf,
            format="A4",
            print_background=True,
            margin={"top": "12mm", "right": "13mm", "bottom": "12mm", "left": "13mm"}
        )
        print(f"[SUCCESS] Portrait Presentation PDF generated: {output_portrait_pdf}")
        page1.close()

        # 2. Synchronize VANI_xAI_NCSC_Project_Report.pdf
        page2 = browser.new_page()
        page2.set_content(generate_portrait_presentation_doc(), wait_until="networkidle")
        output_report_pdf = "VANI_xAI_NCSC_Project_Report.pdf"
        page2.pdf(
            path=output_report_pdf,
            format="A4",
            print_background=True,
            margin={"top": "12mm", "right": "13mm", "bottom": "12mm", "left": "13mm"}
        )
        print(f"[SUCCESS] Official Project Report PDF generated: {output_report_pdf}")
        page2.close()

        # 3. Export high-resolution A4 Portrait images with Dual Logos to VANI-B_IMGs
        page_img = browser.new_page(viewport={"width": 1400, "height": 2000}, device_scale_factor=2)
        custom_style = """
        <style>
          body {
            background: #E2E8F0 !important;
            margin: 0 !important;
            padding: 0 !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            gap: 30px !important;
          }
          .page-container {
            width: 1200px !important;
            height: 1697px !important;
            max-height: 1697px !important;
            padding: 45px 60px !important;
            background: #FFFFFF !important;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1) !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: flex-start !important;
            box-sizing: border-box !important;
            overflow: hidden !important;
          }
          .hero-card {
            padding: 22px 28px !important;
            margin-bottom: 16px !important;
          }
          .hero-logo-box {
            width: 125px !important;
            height: 125px !important;
          }
          h1.project-title {
            font-size: 36px !important;
          }
          .project-subtitle {
            font-size: 18px !important;
          }
          .project-desc {
            font-size: 14px !important;
          }
          h2.section-heading {
            font-size: 22px !important;
            margin-top: 16px !important;
            margin-bottom: 10px !important;
          }
          .card-box {
            padding: 13px 15px !important;
          }
          .card-title {
            font-size: 15px !important;
          }
          .card-desc {
            font-size: 13.5px !important;
            line-height: 1.5 !important;
          }
          .box-callout {
            font-size: 13.5px !important;
            padding: 11px 15px !important;
          }
          table.data-table {
            font-size: 13px !important;
          }
          table.data-table th, table.data-table td {
            padding: 8px 11px !important;
          }
          .step-item {
            padding: 11px 15px !important;
            gap: 14px !important;
          }
          .step-badge {
            font-size: 12px !important;
            padding: 3px 9px !important;
          }
          .step-title {
            font-size: 14.5px !important;
          }
          .step-desc {
            font-size: 13px !important;
          }
          .pillar-pill {
            padding: 7px 9px !important;
          }
          .pillar-pill-title {
            font-size: 12px !important;
          }
          .pillar-pill-sub {
            font-size: 10.5px !important;
          }
          .page-footer {
            font-size: 11.5px !important;
            padding-top: 8px !important;
          }
        </style>
        """
        styled_html = generate_portrait_presentation_doc().replace("</head>", custom_style + "</head>")
        page_img.set_content(styled_html, wait_until="networkidle")

        containers = page_img.query_selector_all(".page-container")
        print(f"[INFO] Exporting {len(containers)} portrait pages with Dual Logos to {output_img_dir}...")
        for idx, container in enumerate(containers):
            img_filename = f"page_{idx+1}.png"
            img_path = os.path.join(output_img_dir, img_filename)
            container.screenshot(path=img_path)
            print(f"  [SAVED] {img_path}")
            
            alt_img_path = os.path.join(output_img_dir, f"VANI_Slide_Page_{idx+1}.png")
            container.screenshot(path=alt_img_path)

        page_img.close()
        browser.close()
    print("[ALL DONE] All Portrait PDF & Image artifacts with Dual Logos generated successfully!")

if __name__ == "__main__":
    generate_pdfs_and_images()
