try {
    const STORAGE_KEY = 'FLEET_MOBILE_PERMANENT_DB';
    let fleetData = [];
    let activeFilter = 'all';

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
                const decompressed = LZString.decompressFromEncodedURIComponent(match[1]);
                if (decompressed) {
                    let syncTs = Date.now();

                    if (decompressed.includes('~') || decompressed.includes('|')) {
                        const segments = decompressed.split('~');
                        const parsedTs = parseInt(segments[0], 10);
                        if (!isNaN(parsedTs) && parsedTs > 0) syncTs = parsedTs;

                        const vehicleRows = segments.slice(1);
                        fleetData = vehicleRows.filter(r => r.trim().length > 0).map(row => {
                            const [id, typeCode, loc, minsStr, notes] = row.split('|');
                            const totalMins = parseInt(minsStr, 10) || 0;
                            const totalHours = totalMins / 60;
                            const isT = (typeCode || '').toUpperCase() === 'T';

                            return {
                                id: id || 'N/A',
                                type: isT ? 'Ciągnik' : 'Dostawczy',
                                loc: loc || '—',
                                timeStr: formatDisplayHours(totalHours),
                                notes: notes || '',
                                hours: totalHours
                            };
                        });
                    } else {
                        const parsed = JSON.parse(decompressed);
                        syncTs = parsed.ts || Date.now();
                        fleetData = (parsed.data || []).map(item => {
                            const isT = item[1] === 'T' || (item[1] || '').toLowerCase() === 'tractor';
                            return {
                                id: item[0] || 'N/A',
                                type: isT ? 'Tractor' : 'Box Truck',
                                loc: item[2] || '—',
                                timeStr: item[3] || '0',
                                notes: item[4] || '',
                                hours: parseHours(item[3])
                            };
                        });
                    }

                    const syncStamp = new Date(syncTs).toLocaleString('pl-PL');

                    localStorage.setItem(STORAGE_KEY, JSON.stringify({
                        savedAt: syncStamp,
                        vehicles: fleetData
                    }));

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

        const isTractorUnit = (v) => v.type.toLowerCase().includes('ciągnik') || v.type.toLowerCase().includes('tractor') || v.type === 'T';
        const isBoxTruckUnit = (v) => v.type.toLowerCase().includes('dostawcz') || v.type.toLowerCase().includes('box') || v.type === 'B';

        const countAll = fleetData.length;
        const countDays = fleetData.filter(v => v.hours >= 24).length;
        const countTractors = fleetData.filter(isTractorUnit).length;
        const countBoxTrucks = fleetData.filter(isBoxTruckUnit).length;

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
                            <i class="bi bi-qr-code-scan" style="font-size: 2.2rem; color: var(--highlight-color);"></i>
                            <strong style="text-transform: uppercase; color: var(--text-color); font-size: 0.8rem;">Brak bazy pojazdów</strong>
                            <p style="font-size: 0.68rem; line-height: 1.5;">
                                Zeskanuj kod QR wygenerowany na komputerze. Dane natychmiast pojawią się tutaj i zostaną zachowane trwale w pamięci podręcznej.
                            </p>
                        </div>
                    `;
            return;
        }

        const filtered = fleetData.filter(v => {
            const isDays = v.hours >= 24;
            const isTractor = isTractorUnit(v);
            const isBox = isBoxTruckUnit(v);

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
                            <span style="font-size: 0.72rem; text-transform: uppercase;">Brak wyników dla podanych filtrów</span>
                        </div>
                    `;
            return;
        }

        container.innerHTML = '';
        filtered.forEach(v => {
            const isDays = v.hours >= 24;
            const isTractor = isTractorUnit(v);
            const card = document.createElement('div');
            card.className = `vehicle-card ${isDays ? 'alert-days' : ''}`;

            card.innerHTML = `
                        <div class="card-row-head">
                            <div class="card-id">${v.id}</div>
                            <span class="card-badge ${isTractor ? 'badge-tractor' : 'badge-boxtruck'}">
                                ${isTractor ? 'Tractor' : 'Box Truck'}
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

    // Zapis do PDF mieszczący się na dokładnie 1 stronie A4 Landscape
    function saveAsPdf() {
        if (!fleetData || fleetData.length === 0) {
            showToast('Baza jest pusta - brak danych do PDF.');
            return;
        }

        const isTractorUnit = (v) => v.type.toLowerCase().includes('tractor') || v.type.toLowerCase().includes('tractor') || v.type === 'T';
        const isBoxTruckUnit = (v) => v.type.toLowerCase().includes('box') || v.type.toLowerCase().includes('box') || v.type === 'B';
        const search = (document.getElementById('searchInput').value || '').toLowerCase().trim();

        let list = fleetData.filter(v => {
            const isDays = v.hours >= 24;
            const isTractor = isTractorUnit(v);
            const isBox = isBoxTruckUnit(v);

            if (activeFilter === 'days' && !isDays) return false;
            if (activeFilter === 'tractor' && !isTractor) return false;
            if (activeFilter === 'boxtruck' && !isBox) return false;

            if (!search) return true;
            return v.id.toLowerCase().includes(search) ||
                v.loc.toLowerCase().includes(search) ||
                v.notes.toLowerCase().includes(search);
        });

        if (list.length === 0) list = fleetData;

        const totalRows = list.length;
        let rowPadding = '4px 6px';
        let fontSize = '8pt';
        let headerFontSize = '7.5pt';

        // Dynamiczne skalowanie, by dokument gwarantowanie zmieścił się na 1 stronie A4 Landscape
        if (totalRows > 40) {
            rowPadding = '1px 3px';
            fontSize = '6pt';
            headerFontSize = '6.5pt';
        } else if (totalRows > 28) {
            rowPadding = '2px 4px';
            fontSize = '6.8pt';
            headerFontSize = '7pt';
        } else if (totalRows > 18) {
            rowPadding = '3px 5px';
            fontSize = '7.4pt';
            headerFontSize = '7.2pt';
        }

        const countAll = list.length;
        const countDays = list.filter(v => v.hours >= 24).length;
        const countTractors = list.filter(isTractorUnit).length;
        const countBoxTrucks = list.filter(isBoxTruckUnit).length;
        const syncTime = document.getElementById('lastSyncDate').textContent || 'Pamięć podręczna';

        const rowsHtml = list.map((v, idx) => {
            const isDays = v.hours >= 24;
            const isTractor = isTractorUnit(v);
            const typeLabel = isTractor ? 'TRACTOR' : 'BOX TRUCK';
            const typeClass = isTractor ? 'badge-t' : 'badge-b';
            return `
                        <tr class="${isDays ? 'alert-days' : ''}">
                            <td style="text-align: center; width: 32px; font-weight: 700; color: #555;">${idx + 1}</td>
                            <td style="font-weight: 800; letter-spacing: 0.04em;">${v.id}</td>
                            <td class="${typeClass}" style="width: 105px;">${typeLabel}</td>
                            <td style="font-weight: 700; color: #1e40af; width: 110px;">${v.loc || '—'}</td>
                            <td class="${isDays ? 'alert-text' : ''}" style="width: 110px; font-weight: 800;">${v.timeStr || formatDisplayHours(v.hours)}</td>
                            <td style="color: #222;">${v.notes || '—'}</td>
                        </tr>
                    `;
        }).join('');

        const printHtml = `<!DOCTYPE html>
<html lang="pl">
<head>
    <meta charset="UTF-8">
    <title>TERMINAL_FLOTY_RAPORT_${Date.now()}</title>
    <style>
        @page {
            size: A4 landscape;
            margin: 4mm 6mm;
        }
        *, *::before, *::after {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            border-radius: 0 !important;
        }
        html, body {
            width: 100%;
            height: 100%;
            max-height: 100vh;
            font-family: 'JetBrains Mono', monospace, 'Courier New', monospace;
            color: #111;
            background: #fff;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            overflow: hidden;
        }
        .page-container {
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
        }
        .report-head {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            border-bottom: 2px solid #111;
            padding-bottom: 3px;
            margin-bottom: 3px;
        }
        .report-title {
            font-size: 10pt;
            font-weight: 800;
            letter-spacing: 0.08em;
            text-transform: uppercase;
        }
        .report-meta {
            font-size: 6.8pt;
            color: #444;
            font-weight: 600;
        }
        .stats-bar {
            display: flex;
            gap: 12px;
            font-size: 7pt;
            font-weight: 700;
            background: #f1f2f4;
            border: 1px solid #c8cbcf;
            padding: 3px 6px;
            margin-bottom: 4px;
            text-transform: uppercase;
        }
        .stats-bar span strong {
            color: #000;
        }
        .table-wrap {
            flex: 1;
            overflow: hidden;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
        }
        th {
            background: #1f2429;
            color: #ffffff;
            font-size: ${headerFontSize};
            font-weight: 800;
            text-transform: uppercase;
            padding: 3px 5px;
            border: 1px solid #1f2429;
            text-align: left;
            letter-spacing: 0.04em;
        }
        td {
            border: 1px solid #cbd0d5;
            padding: ${rowPadding};
            font-size: ${fontSize};
            line-height: 1.15;
            vertical-align: middle;
            word-break: break-word;
        }
        tr:nth-child(even) {
            background-color: #f8fafc;
        }
        tr.alert-days {
            background-color: #fee2e2 !important;
            border-left: 3px solid #dc2626;
        }
        .badge-t {
            color: #1d4ed8;
            font-weight: 800;
        }
        .badge-b {
            color: #c2410c;
            font-weight: 800;
        }
        .alert-text {
            color: #b91c1c;
            font-weight: 800;
        }
    </style>
</head>
<body>
    <div class="page-container">
        <div class="report-head">
            <div class="report-title">TERMINAL FLOTY // RAPORT DANYCH PLACU</div>
            <div class="report-meta">SYNC: ${syncTime} | WYDRUK: ${new Date().toLocaleString('pl-PL')}</div>
        </div>
        <div class="stats-bar">
            <span>POZYCJI: <strong>${countAll}</strong></span>
            <span>|</span>
            <span>≥1 DZIEŃ: <strong style="color: #b91c1c;">${countDays}</strong></span>
            <span>|</span>
            <span>CIĄGNIKI: <strong style="color: #1d4ed8;">${countTractors}</strong></span>
            <span>|</span>
            <span>DOSTAWCZE: <strong style="color: #c2410c;">${countBoxTrucks}</strong></span>
            <span style="margin-left: auto; color: #555;">DOKUMENT 1-STRONICOWY (A4 LANDSCAPE)</span>
        </div>
        <div class="table-wrap">
            <table>
                <thead>
                    <tr>
                        <th style="width: 32px; text-align: center;">LP</th>
                        <th>ID POJAZDU</th>
                        <th style="width: 105px;">TYP</th>
                        <th style="width: 110px;">LOKALIZACJA</th>
                        <th style="width: 110px;">CZAS NA PLACU</th>
                        <th>NOTATKI / STATUS</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>
        </div>
    </div>
</body>
</html>`;

        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write(printHtml);
            printWindow.document.close();
            setTimeout(() => {
                printWindow.focus();
                printWindow.print();
                printWindow.close();
            }, 350);
        } else {
            let frame = document.getElementById('pdfPrintFrame');
            if (!frame) {
                frame = document.createElement('iframe');
                frame.id = 'pdfPrintFrame';
                frame.style.position = 'fixed';
                frame.style.right = '0';
                frame.style.bottom = '0';
                frame.style.width = '0';
                frame.style.height = '0';
                frame.style.border = '0';
                document.body.appendChild(frame);
            }
            const frameDoc = frame.contentWindow.document;
            frameDoc.open();
            frameDoc.write(printHtml);
            frameDoc.close();
            setTimeout(() => {
                frame.contentWindow.focus();
                frame.contentWindow.print();
            }, 350);
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        // Motyw
        const themeToggleBtn = document.getElementById('themeToggle');
        const savedTheme = localStorage.getItem('theme') || 'dark';
        document.documentElement.setAttribute('theme', savedTheme);
        themeToggleBtn.querySelector('i').className = `bi bi-${savedTheme === 'dark' ? 'sun' : 'moon'}`;

        themeToggleBtn.addEventListener('click', () => {
            const isDark = document.documentElement.getAttribute('theme') === 'dark';
            const next = isDark ? 'light' : 'dark';
            document.documentElement.setAttribute('theme', next);
            localStorage.setItem('theme', next);
            themeToggleBtn.querySelector('i').className = `bi bi-${next === 'dark' ? 'sun' : 'moon'}`;
        });

        // Import i wczytanie
        const hasNewData = checkIncomingQRData();
        if (!hasNewData) {
            loadStoredData();
        }
        renderView();

        // Szukanie na żywo
        document.getElementById('searchInput').addEventListener('input', renderView);

        // Filtry chips
        document.querySelectorAll('.filter-chip').forEach(btn => {
            btn.addEventListener('click', function () {
                document.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                activeFilter = this.dataset.filter;
                renderView();
            });
        });

        // Przycisk Zapisz PDF
        document.getElementById('savePdfBtn').addEventListener('click', saveAsPdf);

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
} catch (e) {
    console.error("JavaScript Error:", e);
}