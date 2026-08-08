import time
import threading
import logger
import os

try:
    import pyaudio
    import numpy as np
    from openwakeword.model import Model
    import edge_tts
    import asyncio
except ImportError:
    pyaudio = None
    Model = None
    edge_tts = None

def log_status(message):
    logger.log_status('VOICE', message)

class VoiceAgent:
    def __init__(self):
        self.running = False
        self.thread = None
        self.oww_model = None
        
    def start(self):
        if pyaudio is None or Model is None:
            log_status("Dependencies for VoiceAgent missing. Skipping local wake word.")
            return
            
        if not self.running:
            self.running = True
            self.thread = threading.Thread(target=self._listen_loop, daemon=True)
            self.thread.start()
            log_status("Voice Agent (Wake Word) started.")

    def _listen_loop(self):
        try:
            # We use 'hey_jarvis' as the pre-trained openwakeword model
            self.oww_model = Model(wakeword_models=['hey_jarvis'], inference_framework="onnx")
            
            audio = pyaudio.PyAudio()
            mic_stream = audio.open(format=pyaudio.paInt16, channels=1, rate=16000, input=True, frames_per_buffer=1280)
            
            log_status("Listening for wake word 'Hey Jarvis'...")
            
            while self.running:
                data = np.frombuffer(mic_stream.read(1280, exception_on_overflow=False), dtype=np.int16)
                prediction = self.oww_model.predict(data)
                
                for mdl, score in prediction.items():
                    if score > 0.5:
                        log_status(f"Wake word '{mdl}' detected! Score: {score}")
                        self.on_wake_word_detected()
                        time.sleep(2)
        except Exception as e:
            log_status(f"Error in wake word listener: {e}")
            
    def on_wake_word_detected(self):
        # Play a ping sound or speak
        self.speak("Yes, I am listening.")
        
    def speak(self, text):
        if edge_tts is None:
            log_status(f"Speech [Muted]: {text}")
            return
            
        def _speak():
            try:
                # Use a realistic voice (en-GB-RyanNeural for a JARVIS-like accent)
                voice = "en-GB-RyanNeural"
                communicate = edge_tts.Communicate(text, voice)
                
                temp_file = os.path.join(os.path.dirname(__file__), "temp_speech.mp3")
                asyncio.run(communicate.save(temp_file))
                
                # Play audio invisibly on Windows using PowerShell
                import subprocess
                cmd = f"(New-Object Media.SoundPlayer '{temp_file}').PlaySync()"
                # Note: SoundPlayer only supports WAV natively, so for MP3 we use startfile or a media player.
                # For simplicity, startfile works (opens default media player).
                os.startfile(temp_file)
            except Exception as e:
                log_status(f"TTS Error: {e}")
                
        threading.Thread(target=_speak, daemon=True).start()

agent = VoiceAgent()

def start_agent():
    agent.start()

def speak(text):
    agent.speak(text)
