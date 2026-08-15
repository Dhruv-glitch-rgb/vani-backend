document.addEventListener('DOMContentLoaded', () => {
    
    const elements = {
        cpuPercent: document.getElementById('cpu-percent'),
        cpuBar: document.getElementById('cpu-bar'),
        cpuCores: document.getElementById('cpu-cores'),
        cpuFreq: document.getElementById('cpu-freq'),

        ramPercent: document.getElementById('ram-percent'),
        ramBar: document.getElementById('ram-bar'),
        ramTotal: document.getElementById('ram-total'),
        ramAvail: document.getElementById('ram-avail'),

        diskPercent: document.getElementById('disk-percent'),
        diskBar: document.getElementById('disk-bar'),
        diskTotal: document.getElementById('disk-total'),
        diskFree: document.getElementById('disk-free'),

        netDown: document.getElementById('net-down'),
        netUp: document.getElementById('net-up'),
        netTotalRecv: document.getElementById('net-total-recv'),
        netTotalSent: document.getElementById('net-total-sent'),

        sysOs: document.getElementById('sys-os'),
        sysRelease: document.getElementById('sys-release'),
        sysUptime: document.getElementById('sys-uptime'),

        statusDot: document.getElementById('status-dot'),
        statusText: document.getElementById('status-text')
    };

    let previousNet = { recv: 0, sent: 0, time: 0 };

    // Format Bytes
    const formatBytes = (bytes, decimals = 2) => {
        if (!+bytes) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
    };
    
    const formatNetRate = (bytes) => {
        if (!+bytes) return '0 B/s';
        const k = 1024;
        const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
    };

    // Format Uptime
    const formatUptime = (seconds) => {
        const d = Math.floor(seconds / (3600*24));
        const h = Math.floor(seconds % (3600*24) / 3600);
        const m = Math.floor(seconds % 3600 / 60);
        
        let out = [];
        if(d > 0) out.push(`${d}d`);
        if(h > 0) out.push(`${h}h`);
        if(m > 0) out.push(`${m}m`);
        return out.join(' ') || '< 1m';
    };

    async function fetchStats() {
        try {
            // Note: Since this will be running on the same origin (Flask serves it)
            // We can use relative path
            const res = await fetch('/api/system-stats');
            
            if(!res.ok) throw new Error('API Error');
            
            const data = await res.json();
            
            if(data.status === 'success') {
                updateUI(data);
                
                elements.statusDot.style.background = '#10b981';
                elements.statusText.innerText = 'Connected to Core';
            } else {
                throw new Error(data.message);
            }
        } catch(e) {
            console.error("HUD Polling Error:", e);
            elements.statusDot.style.background = '#ef4444';
            elements.statusText.innerText = 'Connection Lost';
            elements.statusText.style.color = '#ef4444';
        }
    }

    function updateUI(data) {
        // CPU
        elements.cpuPercent.innerText = `${data.cpu.percent.toFixed(1)}%`;
        elements.cpuBar.style.width = `${data.cpu.percent}%`;
        elements.cpuCores.innerText = data.cpu.cores;
        elements.cpuFreq.innerText = `${data.cpu.frequency.toFixed(0)} MHz`;

        // RAM
        elements.ramPercent.innerText = `${data.memory.percent.toFixed(1)}%`;
        elements.ramBar.style.width = `${data.memory.percent}%`;
        elements.ramTotal.innerText = formatBytes(data.memory.total);
        elements.ramAvail.innerText = formatBytes(data.memory.available);

        // Disk
        elements.diskPercent.innerText = `${data.disk.percent.toFixed(1)}%`;
        elements.diskBar.style.width = `${data.disk.percent}%`;
        elements.diskTotal.innerText = formatBytes(data.disk.total);
        elements.diskFree.innerText = formatBytes(data.disk.free);

        // Network
        const now = Date.now();
        if(previousNet.time > 0) {
            const timeDiff = (now - previousNet.time) / 1000; // seconds
            const recvDiff = data.network.bytes_recv - previousNet.recv;
            const sentDiff = data.network.bytes_sent - previousNet.sent;
            
            const downloadRate = recvDiff / timeDiff;
            const uploadRate = sentDiff / timeDiff;
            
            elements.netDown.innerText = formatNetRate(downloadRate);
            elements.netUp.innerText = formatNetRate(uploadRate);
        }
        
        elements.netTotalRecv.innerText = formatBytes(data.network.bytes_recv);
        elements.netTotalSent.innerText = formatBytes(data.network.bytes_sent);
        
        previousNet = {
            recv: data.network.bytes_recv,
            sent: data.network.bytes_sent,
            time: now
        };

        // System
        elements.sysOs.innerText = data.system.os;
        elements.sysRelease.innerText = data.system.release;
        elements.sysUptime.innerText = formatUptime(data.system.uptime_seconds);
    }

    // Initial Fetch
    fetchStats();
    
    // Poll every 2 seconds
    setInterval(fetchStats, 2000);
});
