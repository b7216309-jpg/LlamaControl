#!/usr/bin/env python3
"""
NERV Companion Server - system metrics endpoint
Runs on http://localhost:8765

Install: pip install psutil pynvml
Run:     python companion.py
"""

import json
import platform
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

import psutil

try:
    import winreg
except ImportError:
    winreg = None

try:
    import pynvml
except Exception:
    pynvml = None

HOST = "127.0.0.1"
PORT = 8765
MAX_PROCS = 15
MIN_PROCESS_CPU = 0.1
MIN_DISK_TOTAL_BYTES = int(1e9)
PROCESS_REFRESH_SECONDS = 1.5
DDR_TYPE_LABELS = {20: "DDR", 21: "DDR2", 24: "DDR3", 26: "DDR4", 34: "DDR5"}
CPU_TEMP_SOURCES = ("coretemp", "k10temp", "zenpower")


def detect_cpu_brand():
    if sys.platform != "win32" or winreg is None:
        return platform.processor() or "CPU"

    try:
        key = winreg.OpenKey(
            winreg.HKEY_LOCAL_MACHINE,
            r"HARDWARE\DESCRIPTION\System\CentralProcessor\0",
        )
        brand, _ = winreg.QueryValueEx(key, "ProcessorNameString")
        return brand.strip() or "CPU"
    except Exception:
        return platform.processor() or "CPU"


def probe_ram_label():
    if sys.platform != "win32":
        return "RAM"

    try:
        output = subprocess.check_output(
            ["wmic", "memorychip", "get", "Speed,SMBIOSMemoryType", "/format:csv"],
            text=True,
            timeout=10,
            stderr=subprocess.DEVNULL,
        )
    except Exception:
        return "RAM"

    for line in output.strip().splitlines():
        parts = [part.strip() for part in line.split(",") if part.strip()]
        if len(parts) < 3:
            continue
        try:
            smbios_type = int(parts[1])
            speed = int(parts[2])
        except ValueError:
            continue
        ddr_label = DDR_TYPE_LABELS.get(smbios_type, "DDR")
        return f"{ddr_label}-{speed}"

    return "RAM"


def init_gpu_context():
    if pynvml is None:
        print("No GPU via pynvml (module unavailable), GPU metrics will be empty")
        return {"available": False, "handle": None, "name": ""}

    try:
        pynvml.nvmlInit()
        handle = pynvml.nvmlDeviceGetHandleByIndex(0)
        gpu_name = pynvml.nvmlDeviceGetName(handle)
        if isinstance(gpu_name, bytes):
            gpu_name = gpu_name.decode()
        print("GPU detected:", gpu_name)
        return {"available": True, "handle": handle, "name": gpu_name}
    except Exception as error:
        print(f"No GPU via pynvml ({error}), GPU metrics will be empty")
        return {"available": False, "handle": None, "name": ""}


_cpu_brand = detect_cpu_brand()
_ram_label = "RAM"
_gpu_context = init_gpu_context()
_prev_net = psutil.net_io_counters()
_prev_time = time.time()
_cpu_count = psutil.cpu_count(logical=True) or 1
_primed_pids = set()
_procs_snapshot = []
_procs_lock = threading.Lock()
_workers_started = False

# Prime global cpu_percent so the first request returns meaningful values.
psutil.cpu_percent(percpu=True)


def update_ram_label_worker():
    global _ram_label
    _ram_label = probe_ram_label()


def format_process_memory(memory_info):
    if not memory_info:
        return "0"

    rss = memory_info.rss
    if rss < 1024**3:
        return f"{rss / (1024**2):.0f}M"
    return f"{rss / (1024**3):.1f}G"


def snapshot_processes():
    global _primed_pids

    processes = []
    live_pids = set()
    for proc in psutil.process_iter(["pid", "name", "username", "cpu_percent", "memory_info"]):
        try:
            info = proc.info
            pid = info["pid"]
            if pid == 0:
                continue

            live_pids.add(pid)
            cpu_raw = info["cpu_percent"]
            if cpu_raw is None:
                continue
            if pid not in _primed_pids:
                _primed_pids.add(pid)
                continue

            cpu = cpu_raw / _cpu_count
            if cpu < MIN_PROCESS_CPU:
                continue

            processes.append(
                {
                    "pid": pid,
                    "name": (info["name"] or "")[:20],
                    "user": (info["username"] or "").split("\\")[-1][:12],
                    "cpu": round(cpu, 1),
                    "mem": format_process_memory(info["memory_info"]),
                }
            )
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue

    _primed_pids &= live_pids
    processes.sort(key=lambda item: item["cpu"], reverse=True)
    return processes[:MAX_PROCS]


def process_worker():
    global _procs_snapshot

    while True:
        try:
            snapshot = snapshot_processes()
            with _procs_lock:
                _procs_snapshot = snapshot
        except Exception:
            pass
        time.sleep(PROCESS_REFRESH_SECONDS)


def collect_core_temperatures(core_count):
    try:
        temps_raw = psutil.sensors_temperatures() if hasattr(psutil, "sensors_temperatures") else {}
        for source in CPU_TEMP_SOURCES:
            if source not in temps_raw:
                continue
            entries = temps_raw[source]
            core_temps = [
                entry.current
                for entry in entries
                if "Core" in entry.label or source == "k10temp"
            ]
            if core_temps:
                break
        else:
            core_temps = []
    except Exception:
        core_temps = []

    if len(core_temps) < core_count:
        core_temps.extend([0.0] * (core_count - len(core_temps)))
    return core_temps[:core_count]


def collect_cpu_metrics():
    per_cpu = psutil.cpu_percent(percpu=True)
    freq = psutil.cpu_freq()
    try:
        load = list(psutil.getloadavg())
    except (AttributeError, OSError):
        load = [0.0, 0.0, 0.0]

    core_temps = collect_core_temperatures(len(per_cpu))
    return {
        "cores": [
            {"pct": pct, "temp": round(temp, 1)}
            for pct, temp in zip(per_cpu, core_temps)
        ],
        "freq": round(freq.current / 1000, 2) if freq else 0,
        "freqMax": round(freq.max / 1000, 2) if freq else 0,
        "load": [round(value, 2) for value in load],
        "count": len(per_cpu),
        "brand": _cpu_brand,
    }


def collect_gpu_metrics():
    if not _gpu_context["available"]:
        return {}

    try:
        handle = _gpu_context["handle"]
        util = pynvml.nvmlDeviceGetUtilizationRates(handle)
        temp = pynvml.nvmlDeviceGetTemperature(handle, pynvml.NVML_TEMPERATURE_GPU)
        power = pynvml.nvmlDeviceGetPowerUsage(handle) / 1000
        memory_info = pynvml.nvmlDeviceGetMemoryInfo(handle)
        fan = pynvml.nvmlDeviceGetFanSpeed(handle)
        try:
            core_clock = pynvml.nvmlDeviceGetClockInfo(handle, pynvml.NVML_CLOCK_GRAPHICS)
        except Exception:
            core_clock = 0

        return {
            "name": _gpu_context["name"],
            "util": util.gpu,
            "memUtil": util.memory,
            "temp": temp,
            "power": round(power, 1),
            "fan": fan,
            "vramUsed": round(memory_info.used / (1024**3), 2),
            "vramTotal": round(memory_info.total / (1024**3), 2),
            "vramFree": round(memory_info.free / (1024**3), 2),
            "coreClock": core_clock,
        }
    except Exception as error:
        return {"error": str(error)}


def collect_memory_metrics():
    mem = psutil.virtual_memory()
    swap = psutil.swap_memory()
    return {
        "label": _ram_label,
        "used": round(mem.used / (1024**3), 2),
        "cache": round((getattr(mem, "cached", 0) + getattr(mem, "buffers", 0)) / (1024**3), 2),
        "available": round(mem.available / (1024**3), 2),
        "total": round(mem.total / (1024**3), 2),
        "pct": mem.percent,
        "swapUsed": round(swap.used / (1024**3), 2),
        "swapTotal": round(swap.total / (1024**3), 2),
        "swapPct": swap.percent,
    }


def collect_network_metrics():
    global _prev_net, _prev_time

    net = psutil.net_io_counters()
    now = time.time()
    elapsed = max(0.001, now - _prev_time)
    download_rate = (net.bytes_recv - _prev_net.bytes_recv) / elapsed / 1e6
    upload_rate = (net.bytes_sent - _prev_net.bytes_sent) / elapsed / 1e6
    _prev_net = net
    _prev_time = now

    return {
        "net": {
            "dl": round(max(0, download_rate), 3),
            "ul": round(max(0, upload_rate), 3),
            "rxTotal": f"{net.bytes_recv / 1e9:.1f} GB",
            "txTotal": f"{net.bytes_sent / 1e9:.1f} GB",
        },
        "timestamp": round(now, 3),
    }


def collect_disk_metrics():
    disks = []
    for part in psutil.disk_partitions(all=False):
        try:
            usage = psutil.disk_usage(part.mountpoint)
        except PermissionError:
            continue

        if usage.total < MIN_DISK_TOTAL_BYTES:
            continue

        disks.append(
            {
                "name": part.mountpoint,
                "total": round(usage.total / (1024**3), 1),
                "used": round(usage.used / (1024**3), 1),
                "free": round(usage.free / (1024**3), 1),
                "pct": usage.percent,
            }
        )

    return disks[:6]


def collect_disk_io_metrics():
    try:
        io = psutil.disk_io_counters()
        return {
            "read_bytes": io.read_bytes,
            "write_bytes": io.write_bytes,
        }
    except Exception:
        return {}


def collect_process_metrics():
    with _procs_lock:
        return list(_procs_snapshot)


def collect():
    network = collect_network_metrics()
    return {
        "cpu": collect_cpu_metrics(),
        "gpu": collect_gpu_metrics(),
        "mem": collect_memory_metrics(),
        "net": network["net"],
        "disk": collect_disk_metrics(),
        "diskIo": collect_disk_io_metrics(),
        "procs": collect_process_metrics(),
        "ts": network["timestamp"],
    }


def write_json_response(handler, status_code, payload):
    body = json.dumps(payload, ensure_ascii=False).encode()
    handler.send_response(status_code)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Headers", "*")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            write_json_response(self, 200, collect())
        except Exception as error:
            write_json_response(self, 500, {"error": str(error)})

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.end_headers()

    def log_message(self, *_):
        pass


def start_background_workers():
    global _workers_started
    if _workers_started:
        return
    _workers_started = True
    threading.Thread(target=update_ram_label_worker, daemon=True).start()
    threading.Thread(target=process_worker, daemon=True).start()


def main():
    start_background_workers()
    server = HTTPServer((HOST, PORT), Handler)
    print(f"NERV Companion Server -> http://{HOST}:{PORT}")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


start_background_workers()


if __name__ == "__main__":
    main()
