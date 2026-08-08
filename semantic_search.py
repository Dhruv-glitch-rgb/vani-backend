import os
import glob
import numpy as np
import logger
import threading

try:
    from sentence_transformers import SentenceTransformer
    import faiss
    import PyPDF2
    import docx
except ImportError as e:
    SentenceTransformer = None
    faiss = None

def log_status(message):
    logger.log_status('SEMANTIC', message)

class SemanticSearcher:
    def __init__(self):
        self.model = None
        self.index = None
        self.documents = [] 
        self.initialized = False
        self.is_indexing = False
        
    def initialize(self):
        if SentenceTransformer is None or faiss is None:
            log_status("Dependencies missing. Cannot initialize semantic search.")
            return False
        if not self.model:
            log_status("Loading sentence-transformer model (this may take a while)...")
            try:
                self.model = SentenceTransformer('all-MiniLM-L6-v2')
                self.initialized = True
                log_status("Model loaded successfully.")
            except Exception as e:
                log_status(f"Error loading model: {e}")
                return False
        return True

    def _extract_text(self, filepath):
        ext = os.path.splitext(filepath)[1].lower()
        text = ""
        try:
            if ext in ['.txt', '.md', '.py', '.html', '.css', '.js']:
                with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                    text = f.read()
            elif ext == '.pdf':
                reader = PyPDF2.PdfReader(filepath)
                for page in reader.pages:
                    text += page.extract_text() + "\n"
            elif ext == '.docx':
                doc = docx.Document(filepath)
                for para in doc.paragraphs:
                    text += para.text + "\n"
        except Exception as e:
            pass
        return text

    def build_index_async(self, directory):
        if self.is_indexing:
            log_status("Already indexing...")
            return
        threading.Thread(target=self.build_index, args=(directory,), daemon=True).start()

    def build_index(self, directory):
        if not self.initialized and not self.initialize():
            return False
            
        self.is_indexing = True
        log_status(f"Building index for directory: {directory}")
        
        self.documents = []
        texts = []
        
        valid_exts = ['.txt', '.md', '.pdf', '.docx', '.py', '.html']
        count = 0
        for root, _, files in os.walk(directory):
            if any(part.startswith('.') or part in ['node_modules', 'venv', '__pycache__', 'env', 'bin', 'static', 'templates'] for part in root.split(os.sep)):
                continue
                
            for file in files:
                ext = os.path.splitext(file)[1].lower()
                if ext in valid_exts:
                    filepath = os.path.join(root, file)
                    content = self._extract_text(filepath)
                    if content.strip():
                        chunks = [content[i:i+800] for i in range(0, len(content), 800)]
                        for chunk in chunks:
                            self.documents.append({'path': filepath, 'chunk': chunk})
                            texts.append(chunk)
                    count += 1
                    if count >= 200:
                        break
            if count >= 200:
                break
                
        if not texts:
            log_status("No valid text found in directory.")
            self.is_indexing = False
            return False
            
        log_status(f"Encoding {len(texts)} chunks...")
        try:
            embeddings = self.model.encode(texts, convert_to_numpy=True)
            dimension = embeddings.shape[1]
            self.index = faiss.IndexFlatL2(dimension)
            self.index.add(embeddings)
            log_status(f"Index built successfully with {self.index.ntotal} vectors.")
        except Exception as e:
            log_status(f"Error building FAISS index: {e}")
            
        self.is_indexing = False
        return True

    def search(self, query, top_k=3):
        if not self.initialized or self.index is None:
            return "Semantic index not built. Please ask me to 'build semantic index' first."
            
        try:
            query_embedding = self.model.encode([query], convert_to_numpy=True)
            distances, indices = self.index.search(query_embedding, top_k)
            
            results = []
            for i in range(len(indices[0])):
                idx = indices[0][i]
                if idx < len(self.documents):
                    doc = self.documents[idx]
                    path = os.path.abspath(doc['path'])
                    preview = doc['chunk'][:200].replace('\\n', ' ').strip()
                    results.append(f"File: {path}\\nPreview: {preview}...")
                    
            if results:
                return "God-Mode Semantic Matches:\\n" + "\\n\\n".join(results)
        except Exception as e:
            return f"Error during semantic search: {e}"
            
        return "No relevant matches found."

searcher = SemanticSearcher()
