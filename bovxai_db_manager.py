"""
bovxai_db_manager.py
====================
Sovereign Local Heavy-Data Storage Engine for V.A.N.I-xAI (Bureau Of V.A.N.I-xAI)
Stores images, voice notes, media, and Quantum Beam transfers locally under:
E:\\BoVxAi DB\\<V.A.N.I-xAI-USER-ID>\\

Eliminates high-cost cloud bandwidth and protects 100% student data sovereignty.
"""

import os
import re
import json
import time
import base64
import mimetypes
from datetime import datetime

# Primary Sovereign Storage Path specified by BoVxAi Architecture
PRIMARY_STORAGE_DIR = r"E:\BoVxAi DB"
FALLBACK_STORAGE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "BoVxAi_DB")

def get_base_storage_dir():
    """
    Returns the primary storage directory (E:\\BoVxAi DB) if accessible,
    otherwise gracefully falls back to local workspace directory.
    """
    try:
        if not os.path.exists(PRIMARY_STORAGE_DIR):
            os.makedirs(PRIMARY_STORAGE_DIR, exist_ok=True)
        return PRIMARY_STORAGE_DIR
    except Exception:
        os.makedirs(FALLBACK_STORAGE_DIR, exist_ok=True)
        return FALLBACK_STORAGE_DIR

def sanitize_user_id(user_id):
    """
    Sanitizes user ID to ensure safe folder naming on Windows while preserving
    standard V.A.N.I-xAI UID formats (e.g., 'V.A.N.I-xAI-DHRU-2026').
    Removes illegal Windows characters: < > : " / \\ | ? *
    """
    if not user_id or not isinstance(user_id, str):
        return "V.A.N.I-xAI-GUEST"
    
    cleaned = user_id.strip()
    # Normalize slashes or colons (Windows filename safety)
    cleaned = re.sub(r'[<>:"/\\|?*]', '-', cleaned)
    # Ensure it doesn't end with a dot or space
    cleaned = cleaned.rstrip('. ')
    if not cleaned:
        return "V.A.N.I-xAI-GUEST"
    return cleaned

def get_user_dir(user_id):
    """
    Returns the root folder for a specific user UID: E:\\BoVxAi DB\\<USER_ID>\\
    Ensures the directory exists.
    """
    base_dir = get_base_storage_dir()
    safe_uid = sanitize_user_id(user_id)
    user_path = os.path.join(base_dir, safe_uid)
    os.makedirs(user_path, exist_ok=True)
    
    # Initialize metadata if not existing
    meta_path = os.path.join(user_path, "metadata.json")
    if not os.path.exists(meta_path):
        initial_meta = {
            "vani_user_id": safe_uid,
            "created_at": datetime.now().isoformat(),
            "last_active": datetime.now().isoformat(),
            "total_bytes": 0,
            "file_counts": {
                "images": 0,
                "voice_notes": 0,
                "beam_media": 0,
                "others": 0
            }
        }
        try:
            with open(meta_path, "w", encoding="utf-8") as f:
                json.dump(initial_meta, f, indent=2)
        except Exception:
            pass

    return user_path

def get_category_dir(user_id, category):
    """
    Returns and creates the category subfolder inside user's directory:
    E:\\BoVxAi DB\\<USER_ID>\\<category>\\
    Categories: 'images', 'voice_notes', 'beam_media', 'others'
    """
    valid_categories = {'images', 'voice_notes', 'beam_media', 'others'}
    cat = category.lower().strip() if category else 'others'
    if cat not in valid_categories:
        cat = 'others'
        
    user_path = get_user_dir(user_id)
    cat_path = os.path.join(user_path, cat)
    os.makedirs(cat_path, exist_ok=True)
    return cat_path

def save_user_media(user_id, category, filename, binary_data):
    """
    Saves binary data into E:\\BoVxAi DB\\<USER_ID>\\<category>\\<safe_filename>
    Updates user's metadata.json with file stats.
    Returns: dict with success status, relative path, file size, and timestamp.
    """
    cat_dir = get_category_dir(user_id, category)
    
    # Safe filename generation
    clean_name = os.path.basename(filename or "media_asset")
    clean_name = re.sub(r'[<>:"/\\|?*]', '_', clean_name)
    
    timestamp = int(time.time() * 1000)
    name_part, ext_part = os.path.splitext(clean_name)
    if not ext_part:
        if category == 'images':
            ext_part = '.png'
        elif category == 'voice_notes':
            ext_part = '.webm'
        else:
            ext_part = '.bin'
            
    final_filename = f"{name_part}_{timestamp}{ext_part}"
    file_path = os.path.join(cat_dir, final_filename)
    
    with open(file_path, "wb") as f:
        f.write(binary_data)
        
    file_size = len(binary_data)
    safe_uid = sanitize_user_id(user_id)
    
    # Update user metadata
    user_path = os.path.join(get_base_storage_dir(), safe_uid)
    meta_path = os.path.join(user_path, "metadata.json")
    try:
        if os.path.exists(meta_path):
            with open(meta_path, "r", encoding="utf-8") as f:
                meta = json.load(f)
        else:
            meta = {
                "vani_user_id": safe_uid,
                "created_at": datetime.now().isoformat(),
                "file_counts": {}
            }
        
        meta["last_active"] = datetime.now().isoformat()
        meta["total_bytes"] = meta.get("total_bytes", 0) + file_size
        cat_counts = meta.get("file_counts", {})
        cat_counts[category] = cat_counts.get(category, 0) + 1
        meta["file_counts"] = cat_counts
        
        with open(meta_path, "w", encoding="utf-8") as f:
            json.dump(meta, f, indent=2)
    except Exception:
        pass
        
    return {
        "success": True,
        "user_id": safe_uid,
        "category": category,
        "filename": final_filename,
        "size_bytes": file_size,
        "relative_url": f"/api/storage/media/{safe_uid}/{category}/{final_filename}",
        "stored_path": file_path,
        "timestamp": timestamp
    }

def save_base64_media(user_id, category, filename, base64_str):
    """
    Decodes a base64 string or data URL (e.g. data:image/png;base64,...)
    and stores it in E:\\BoVxAi DB\\<USER_ID>\\<category>\\
    """
    if ',' in base64_str:
        header, base64_data = base64_str.split(',', 1)
        # Attempt to determine extension from data header
        if 'image/jpeg' in header and not filename.endswith('.jpg'):
            filename += '.jpg'
        elif 'image/png' in header and not filename.endswith('.png'):
            filename += '.png'
        elif 'audio/webm' in header and not filename.endswith('.webm'):
            filename += '.webm'
        elif 'audio/mp3' in header and not filename.endswith('.mp3'):
            filename += '.mp3'
    else:
        base64_data = base64_str
        
    binary_data = base64.b64decode(base64_data)
    return save_user_media(user_id, category, filename, binary_data)

def get_user_media(user_id, category, filename):
    """
    Retrieves full path and mimetype for media file.
    Validates boundary to avoid path traversal.
    """
    safe_uid = sanitize_user_id(user_id)
    cat_dir = get_category_dir(safe_uid, category)
    clean_filename = os.path.basename(filename)
    target_path = os.path.join(cat_dir, clean_filename)
    
    if os.path.exists(target_path) and os.path.isfile(target_path):
        mime, _ = mimetypes.guess_type(target_path)
        return {
            "found": True,
            "path": target_path,
            "filename": clean_filename,
            "mimetype": mime or "application/octet-stream"
        }
    return {"found": False, "path": None, "mimetype": None}

def list_user_files(user_id, category=None):
    """
    Lists files stored for a user in a specific category or across all categories.
    """
    safe_uid = sanitize_user_id(user_id)
    user_path = get_user_dir(safe_uid)
    categories = [category] if category else ['images', 'voice_notes', 'beam_media', 'others']
    
    results = {}
    for cat in categories:
        cat_path = os.path.join(user_path, cat)
        cat_files = []
        if os.path.exists(cat_path):
            for fname in sorted(os.listdir(cat_path), reverse=True):
                full_path = os.path.join(cat_path, fname)
                if os.path.isfile(full_path):
                    stat = os.stat(full_path)
                    cat_files.append({
                        "filename": fname,
                        "size_bytes": stat.st_size,
                        "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                        "url": f"/api/storage/media/{safe_uid}/{cat}/{fname}"
                    })
        results[cat] = cat_files
    return results

def get_user_storage_stats(user_id):
    """
    Computes storage statistics for the given user from E:\\BoVxAi DB\\<USER_ID>\\
    """
    safe_uid = sanitize_user_id(user_id)
    user_path = get_user_dir(safe_uid)
    meta_path = os.path.join(user_path, "metadata.json")
    
    total_bytes = 0
    file_counts = {"images": 0, "voice_notes": 0, "beam_media": 0, "others": 0}
    
    for cat in file_counts.keys():
        cat_dir = os.path.join(user_path, cat)
        if os.path.exists(cat_dir):
            for f in os.listdir(cat_dir):
                fp = os.path.join(cat_dir, f)
                if os.path.isfile(fp):
                    file_counts[cat] += 1
                    total_bytes += os.path.getsize(fp)
                    
    stats = {
        "user_id": safe_uid,
        "storage_root": get_base_storage_dir(),
        "total_bytes": total_bytes,
        "total_mb": round(total_bytes / (1024 * 1024), 2),
        "file_counts": file_counts,
        "total_files": sum(file_counts.values())
    }
    
    # Save back to metadata.json
    try:
        if os.path.exists(meta_path):
            with open(meta_path, "r", encoding="utf-8") as mf:
                meta = json.load(mf)
        else:
            meta = {"created_at": datetime.now().isoformat()}
        meta.update(stats)
        meta["last_active"] = datetime.now().isoformat()
        with open(meta_path, "w", encoding="utf-8") as mf:
            json.dump(meta, mf, indent=2)
    except Exception:
        pass
        
    return stats
