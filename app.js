const STORAGE_KEY = 'FLEET_MOBILE_PERMANENT_DB';
let fleetData = [];
let activeFilter = 'all';

// Pomocnik parsowania godzin
function parseHours(timeStr) {
    if (!timeStr) return 0;
    if (typeof timeStr === 'number') return timeStr;
    const s = String(timeStr).trim().toLowerCase();

    const colon = s.match(/^(\d+)\s*:\s*(\d{1,2})$/);
    if (colon) {
        return parseInt(colon[1], 10) + parseInt(colon[2], 10) / 60;
    }

    let total = 0;
    const dayMatch = s.match(/(\d+(?:[.,]\d+)?)\s*(?:d|dni|day|days)\b/);
    if (dayMatch) {
        total += parseFloat(dayMatch[1].replace(',', '.')) * 24;
    }
    const hMatch = s.match(/(\d+(?:[.,]\d+)?)\s*(?:h|godz)\b/);
    if (hMatch) {
        total += parseFloat(hMatch[1].replace(',', '.'));
    }
    const mMatch = s.match(/(\d+)\s*(?:m|min)\b/);
    if (mMatch) {
        total += parseInt(mMatch[1], 10) / 60;
    }
    if (total > 0) return total;

    const plain = s.match(/(\d+(?:[.,]\d+)?)/);
    return plain ? parseFloat(plain[1].replace(',', '.')) : 0;
}

function formatDisplayHours(hours) {
    if (!Number.isFinite(hours) || hours <= 0) return '0 h';
    const totalMin = Math.round(hours * 60);
    const days = Math.floor(totalMin / (24 * 60));
    const remMin = totalMin % (24 * 60);
    const hh = Math.floor(remMin / 60);
    const mm = remMin % 60;

    const parts = [];
    if (days > 0) parts.push(`${days} d`);
    if (hh > 0) parts.push(`${hh} h`);
    if (mm > 0 && days === 0) parts.push(`${mm} min`);
    return parts.join(' - ') || '0 h';
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2800);
}

function checkIncomingQRData() {
    const hash = window.location.hash || '';
    const match = hash.match(/[#&]d=([^&]+)/);

    if (match && match[1]) {
        try {
            // Dekompresja danych z parametru d
            const decompressed = LZString.decompressFromEncodedURIComponent(match[1]);
            if (decompressed) {
                const parsed = JSON.parse(decompressed);

                // Dane przesyłane są w minimalnej tablicy tablic: [id, typ, loc, time, notes]
                fleetData = (parsed.data || []).map(item => ({
                    id: item[0] || 'N/A',
                    type: item[1] === 'T' ? 'Tractor' : (item[1] === 'B' ? 'Box Truck' : item[1]),
                    loc: item[2] || '—',
                    timeStr: item[3] || '0',
                    notes: item[4] || '',
                    hours: parseHours(item[3])
                }));

                const syncStamp = new Date(parsed.ts || Date.now()).toLocaleString('pl-PL');

                // Trwały zapis w telefonie
                localStorage.setItem(STORAGE_KEY, JSON.stringify({
                    savedAt: syncStamp,
                    vehicles: fleetData
                }));

                // Czyszczenie paska adresu, aby link pozostał krótki i czysty
                window.history.replaceState(null, '', window.location.pathname);

                showToast(`Zapisano ${fleetData.length} pojazdów w pamięci telefonu!`);
                return true;
            }
        } catch (e) {
            console.error('Błąd importu pakietu QR:', e);
            showToast('Błąd odczytu danych z kodu QR.');
        }
    }
    return false;
}

function loadStoredData() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
        try {
            const parsed = JSON.parse(raw);
            fleetData = parsed.vehicles || [];
            document.getElementById('lastSyncDate').textContent = parsed.savedAt || 'Pamięć urządzenia';
            return true;
        } catch (e) {
            console.error('Błąd odczytu localStorage:', e);
        }
    }
    return false;
}

function renderView() {
    const container = document.getElementById('cardsContainer');
    const search = (document.getElementById('searchInput').value || '').toLowerCase().trim();

    const countAll = fleetData.length;
    const countDays = fleetData.filter(v => v.hours >= 24).length;
    const countTractors = fleetData.filter(v => v.type.toLowerCase() === 'tractor').length;
    const countBoxTrucks = fleetData.filter(v => v.type.toLowerCase() === 'box truck').length;

    document.getElementById('countTotal').textContent = countAll;
    document.getElementById('countAlerts').textContent = countDays;
    document.getElementById('countTractors').textContent = countTractors;
    document.getElementById('countBoxTrucks').textContent = countBoxTrucks;

    document.getElementById('chipCountAll').textContent = countAll;
    document.getElementById('chipCountDays').textContent = countDays;
    document.getElementById('chipCountTractors').textContent = countTractors;
    document.getElementById('chipCountBoxTrucks').textContent = countBoxTrucks;

    if (fleetData.length === 0) {
        container.innerHTML = `
                    <div class="empty-placeholder">
                        <i class="bi bi-qr-code-scan" style="font-size: 2.4rem; color: var(--highlight-color);"></i>
                        <strong style="text-transform: uppercase; color: #fff;">Brak bazy pojazdów</strong>
                        <p style="font-size: 0.72rem; line-height: 1.5;">
                            Zeskanuj kod QR wygenerowany na komputerze. Dane natychmiast pojawią się tutaj i zostaną zachowane na stałe.
                        </p>
                    </div>
                `;
        return;
    }

    const filtered = fleetData.filter(v => {
        const isDays = v.hours >= 24;
        const isTractor = v.type.toLowerCase() === 'tractor';
        const isBox = v.type.toLowerCase() === 'box truck';

        if (activeFilter === 'days' && !isDays) return false;
        if (activeFilter === 'tractor' && !isTractor) return false;
        if (activeFilter === 'boxtruck' && !isBox) return false;

        if (!search) return true;
        return v.id.toLowerCase().includes(search) ||
            v.loc.toLowerCase().includes(search) ||
            v.notes.toLowerCase().includes(search);
    });

    if (filtered.length === 0) {
        container.innerHTML = `
                    <div class="empty-placeholder">
                        <i class="bi bi-search" style="font-size: 1.8rem;"></i>
                        <span>Brak wyników dla podanych filtrów</span>
                    </div>
                `;
        return;
    }

    container.innerHTML = '';
    filtered.forEach(v => {
        const isDays = v.hours >= 24;
        const isTractor = v.type.toLowerCase() === 'tractor';
        const card = document.createElement('div');
        card.className = `vehicle-card ${isDays ? 'alert-days' : ''}`;

        card.innerHTML = `
                    <div class="card-row-head">
                        <div class="card-id">${v.id}</div>
                        <span class="card-badge ${isTractor ? 'badge-tractor' : 'badge-boxtruck'}">
                            ${v.type}
                        </span>
                    </div>

                    <div class="card-grid">
                        <div class="grid-item">
                            <span class="label">Lokalizacja</span>
                            <span class="value value-loc">${v.loc}</span>
                        </div>
                        <div class="grid-item">
                            <span class="label">Czas na placu</span>
                            <span class="value ${isDays ? 'value-time-alert' : ''}">
                                ${formatDisplayHours(v.hours)}
                            </span>
                        </div>
                    </div>

                    <div>
                        <span class="label">Notatki / Uwagi</span>
                        <div class="notes-box">${v.notes || '—'}</div>
                    </div>
                `;
        container.appendChild(card);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    // 1. Sprawdź czy przyszedł pakiet z kodu QR
    const hasNewData = checkIncomingQRData();

    // 2. Jeśli nie było nowego kodu, wczytaj wcześniej zapisaną bazę
    if (!hasNewData) {
        loadStoredData();
    }

    renderView();

    // Szukarka na żywo
    document.getElementById('searchInput').addEventListener('input', renderView);

    // Filtry (chips)
    document.querySelectorAll('.filter-chip').forEach(btn => {
        btn.addEventListener('click', function () {
            document.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            activeFilter = this.dataset.filter;
            renderView();
        });
    });

    // Modal czyszczenia bazy
    const modal = document.getElementById('clearModal');
    document.getElementById('openClearModalBtn').addEventListener('click', () => {
        if (fleetData.length === 0) {
            showToast('Baza jest już pusta.');
            return;
        }
        modal.style.display = 'flex';
    });

    document.getElementById('cancelClearBtn').addEventListener('click', () => {
        modal.style.display = 'none';
    });

    document.getElementById('confirmClearBtn').addEventListener('click', () => {
        localStorage.removeItem(STORAGE_KEY);
        fleetData = [];
        document.getElementById('lastSyncDate').textContent = 'Wyczyszczono';
        modal.style.display = 'none';
        renderView();
        showToast('Baza danych telefonu została trwale usunięta.');
    });
});