#!/usr/bin/env python3
"""
NERV Companion Server — system metrics endpoint
Runs on http://localhost:8765

Install: pip install psutil pynvml
Run:     python companion.py
"""

import json, time, threading
from http.server import HTTPServer, BaseHTTPRequestHandler
import psutil

try:
    import platform, sys, subprocess
    _cpu_brand = "CPU"
    if sys.platform == "win32":
        try:
            import winreg
            key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r'HARDWARE\DESCRIPTION\System\CentralProcessor\0')
            _cpu_brand, _ = winreg.QueryValueEx(key, 'ProcessorNameString')
            _cpu_brand = _cpu_brand.strip()
        except Exception:
            _cpu_brand = platform.processor() or "CPU"
    else:
        _cpu_brand = platform.processor() or "CPU"
except Exception:
    _cpu_brand = "CPU"

_ram_label = "RAM"
try:
    if sys.platform == "win32":
        out = subprocess.check_output(
            ["wmic", "memorychip", "get", "Speed,SMBIOSMemoryType", "/format:csv"],
            text=True, timeout=5, stderr=subprocess.DEVNULL
        )
        _ddr_map = {20: "DDR", 21: "DDR2", 24: "DDR3", 26: "DDR4", 34: "DDR5"}
        for line in out.strip().splitlines():
            parts = [p.strip() for p in line.split(",") if p.strip()]
            if len(parts) >= 3:
                try:
                    smbios_type = int(parts[1])
                    speed = int(parts[2])
                    ddr = _ddr_map.get(smbios_type, "DDR")
                    _ram_label = f"{ddr}-{speed}"
                    break
                except ValueError:
                    continue
except Exception:
    pass

try:
    import pynvml
    pynvml.nvmlInit()
    GPU = pynvml.nvmlDeviceGetHandleByIndex(0)
    HAS_GPU = True
    gpu_name = pynvml.nvmlDeviceGetName(GPU)
    if isinstance(gpu_name, bytes):
        gpu_name = gpu_name.decode()
    print("GPU detected:", gpu_name)
except Exception as e:
    HAS_GPU = False
    print(f"No GPU via pynvml ({e}), GPU metrics will be empty")

_prev_net  = psutil.net_io_counters()
_prev_time = time.time()
_cache     = {}
_lock      = threading.Lock()

def collect():
    global _prev_net, _prev_time

    # ── CPU ──────────────────────────────────────────────────────
    per_cpu   = psutil.cpu_percent(percpu=True)
    freq      = psutil.cpu_freq()
    try:
        load = list(psutil.getloadavg())
    except (AttributeError, OSError):
        load = [0.0, 0.0, 0.0]

    # Per-core temps (Linux: /sys sensors; Windows: may be empty)
    try:
        temps_raw = psutil.sensors_temperatures() if hasattr(psutil, 'sensors_temperatures') else {}
        # try coretemp or k10temp
        core_temps = []
        for key in ("coretemp", "k10temp", "zenpower"):
            if key in temps_raw:
                core_temps = [e.current for e in temps_raw[key] if "Core" in e.label or key == "k10temp"]
                break
        if not core_temps:
            core_temps = [0.0] * len(per_cpu)
    except Exception:
        core_temps = [0.0] * len(per_cpu)

    # Pad / trim to match core count
    while len(core_temps) < len(per_cpu):
        core_temps.append(0.0)

    # ── GPU ──────────────────────────────────────────────────────
    gpu = {}
    if HAS_GPU:
        try:
            util     = pynvml.nvmlDeviceGetUtilizationRates(GPU)
            temp     = pynvml.nvmlDeviceGetTemperature(GPU, pynvml.NVML_TEMPERATURE_GPU)
            power    = pynvml.nvmlDeviceGetPowerUsage(GPU) / 1000          # mW → W
            mem_info = pynvml.nvmlDeviceGetMemoryInfo(GPU)
            fan      = pynvml.nvmlDeviceGetFanSpeed(GPU)
            try:
                clk = pynvml.nvmlDeviceGetClockInfo(GPU, pynvml.NVML_CLOCK_GRAPHICS)
            except Exception:
                clk = 0
            gpu = {
                "name":      gpu_name,
                "util":      util.gpu,
                "memUtil":   util.memory,
                "temp":      temp,
                "power":     round(power, 1),
                "fan":       fan,
                "vramUsed":  round(mem_info.used  / (1024**3), 2),
                "vramTotal": round(mem_info.total / (1024**3), 2),
                "vramFree":  round(mem_info.free  / (1024**3), 2),
                "coreClock": clk,
            }
        except Exception as e:
            gpu = {"error": str(e)}

    # ── MEMORY ───────────────────────────────────────────────────
    mem  = psutil.virtual_memory()
    swap = psutil.swap_memory()

    # ── NETWORK ──────────────────────────────────────────────────
    net  = psutil.net_io_counters()
    now  = time.time()
    dt   = max(0.001, now - _prev_time)
    dl   = (net.bytes_recv - _prev_net.bytes_recv) / dt / 1e6   # MB/s
    ul   = (net.bytes_sent - _prev_net.bytes_sent) / dt / 1e6
    _prev_net  = net
    _prev_time = now

    # ── DISK ─────────────────────────────────────────────────────
    disks = []
    for part in psutil.disk_partitions(all=False):
        try:
            u = psutil.disk_usage(part.mountpoint)
            # Skip tiny/virtual mounts
            if u.total < 1e9:
                continue
            disks.append({
                "name":  part.mountpoint,
                "total": round(u.total / (1024**3), 1),
                "used":  round(u.used  / (1024**3), 1),
                "free":  round(u.free  / (1024**3), 1),
                "pct":   u.percent,
            })
        except PermissionError:
            pass

    # ── PROCESSES ──────────────────────────────────────────────────
    procs = []
    try:
        for p in psutil.process_iter(['pid', 'name', 'username', 'cpu_percent', 'memory_info']):
            try:
                info = p.info
                if info['cpu_percent'] is None or info['cpu_percent'] < 0.1 or info['pid'] == 0:
                    continue
                pmem = info['memory_info']
                mem_str = f"{pmem.rss / (1024**2):.0f}M" if pmem and pmem.rss < 1024**3 else (f"{pmem.rss / (1024**3):.1f}G" if pmem else "0")
                procs.append({
                    "pid": info['pid'],
                    "name": (info['name'] or '')[:20],
                    "user": (info['username'] or '').split('\\')[-1][:12],
                    "cpu": round(info['cpu_percent'], 1),
                    "mem": mem_str,
                    "gpu": 0,
                })
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
        procs.sort(key=lambda x: x['cpu'], reverse=True)
        procs = procs[:15]
    except Exception:
        procs = []

    # ── DISK I/O ─────────────────────────────────────────────────
    try:
        io = psutil.disk_io_counters()
        disk_io = {
            "read_bytes":  io.read_bytes,
            "write_bytes": io.write_bytes,
        }
    except Exception:
        disk_io = {}

    return {
        "cpu": {
            "cores": [{"pct": p, "temp": round(t, 1)}
                      for p, t in zip(per_cpu, core_temps)],
            "freq":  round(freq.current / 1000, 2) if freq else 0,
            "freqMax": round(freq.max / 1000, 2) if freq else 0,
            "load":  [round(v, 2) for v in load],
            "count": len(per_cpu),
            "brand": _cpu_brand,
        },
        "gpu":  gpu,
        "mem": {
            "label":     _ram_label,
            "used":      round(mem.used      / (1024**3), 2),
            "cache":     round((getattr(mem, "cached", 0) + getattr(mem, "buffers", 0)) / (1024**3), 2),
            "available": round(mem.available / (1024**3), 2),
            "total":     round(mem.total     / (1024**3), 2),
            "pct":       mem.percent,
            "swapUsed":  round(swap.used  / (1024**3), 2),
            "swapTotal": round(swap.total / (1024**3), 2),
            "swapPct":   swap.percent,
        },
        "net": {
            "dl":      round(max(0, dl), 3),
            "ul":      round(max(0, ul), 3),
            "rxTotal": f"{net.bytes_recv / 1e9:.1f} GB",
            "txTotal": f"{net.bytes_sent / 1e9:.1f} GB",
        },
        "disk": disks[:6],
        "diskIo": disk_io,
        "procs": procs,
        "ts": round(now, 3),
    }


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            data = collect()
            body = json.dumps(data, ensure_ascii=False).encode()
            self.send_response(200)
        except Exception as e:
            body = json.dumps({"error": str(e)}).encode()
            self.send_response(500)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.end_headers()

    def log_message(self, *_):
        pass  # suppress access logs


if __name__ == "__main__":
    host, port = "localhost", 8765
    server = HTTPServer((host, port), Handler)
    print(f"NERV Companion Server -> http://{host}:{port}")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
