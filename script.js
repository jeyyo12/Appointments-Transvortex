// Storage key pentru localStorage
const STORAGE_KEY = 'transvortex_facebook_pages';

// Array-ul cu paginile
let pages = [];

// Încarcă paginile la pornirea aplicației
document.addEventListener('DOMContentLoaded', () => {
    loadPages();
    renderPages();
    updateStats();
    setupEventListeners();
});

// Setup event listeners
function setupEventListeners() {
    // Form submit
    const form = document.getElementById('pageForm');
    form.addEventListener('submit', handleAddPage);
}

// Handle adăugare pagină nouă
function handleAddPage(e) {
    e.preventDefault();

    const pageName = document.getElementById('pageName').value.trim();
    const pageUrl = document.getElementById('pageUrl').value.trim();
    const pageAvatar = document.getElementById('pageAvatar').value.trim();

    // Validare URL Facebook
    if (!pageUrl.includes('facebook.com')) {
        alert('Te rog introdu un URL valid de Facebook!');
        return;
    }

    // Creează obiect pagină
    const newPage = {
        id: Date.now(),
        name: pageName,
        url: pageUrl,
        avatar: pageAvatar || '',
        postedToday: false,
        lastPosted: null,
        addedDate: new Date().toISOString()
    };

    // Adaugă în array
    pages.push(newPage);

    // Salvează
    savePages();

    // Re-renderizează
    renderPages();
    updateStats();

    // Reset form
    e.target.reset();

    // Show success message
    showNotification('Pagină adăugată cu succes!', 'success');
}

// Încarcă paginile din localStorage
function loadPages() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
        pages = JSON.parse(stored);
        // Reset posted status dacă e o nouă zi
        checkAndResetDailyStatus();
    }
}

// Salvează paginile în localStorage
function savePages() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pages));
}

// Verifică și resetează status zilnic
function checkAndResetDailyStatus() {
    const today = new Date().toDateString();
    let needsUpdate = false;

    pages.forEach(page => {
        if (page.lastPosted) {
            const lastPostedDate = new Date(page.lastPosted).toDateString();
            if (lastPostedDate !== today && page.postedToday) {
                page.postedToday = false;
                needsUpdate = true;
            }
        }
    });

    if (needsUpdate) {
        savePages();
    }
}

// Renderizează lista de pagini
function renderPages() {
    const pagesList = document.getElementById('pagesList');
    const emptyState = document.getElementById('emptyState');

    // Verifică dacă lista e goală
    if (pages.length === 0) {
        pagesList.innerHTML = '';
        emptyState.classList.add('show');
        return;
    }

    emptyState.classList.remove('show');

    // Creează HTML pentru fiecare pagină
    const pagesHTML = pages.map(page => createPageCard(page)).join('');
    pagesList.innerHTML = pagesHTML;

    // Adaugă event listeners pentru butoane
    attachPageEventListeners();
}

// Crează card pentru o pagină
function createPageCard(page) {
    // Determină clasa de status: verde (postat), galben (pending), roșu (vechi - de șters)
    const daysSinceAdded = Math.floor((new Date() - new Date(page.addedDate)) / (1000 * 60 * 60 * 24));
    const daysSincePosted = page.lastPosted ? Math.floor((new Date() - new Date(page.lastPosted)) / (1000 * 60 * 60 * 24)) : 999;
    
    let statusClass, cardClass, statusIcon, statusText;
    
    if (page.postedToday) {
        // Verde - Postat astăzi
        cardClass = 'posted-today';
        statusClass = 'status-posted';
        statusIcon = 'fa-check-circle';
        statusText = 'Postat astăzi';
    } else if (daysSincePosted > 30 || (daysSinceAdded > 30 && !page.lastPosted)) {
        // Roșu - Pagină veche, nepostată de mult timp (sugestie de ștergere)
        cardClass = 'to-delete';
        statusClass = 'status-delete';
        statusIcon = 'fa-exclamation-triangle';
        statusText = 'Neactivă - Sugestie ștergere';
    } else {
        // Galben - De postat
        cardClass = 'pending';
        statusClass = 'status-pending';
        statusIcon = 'fa-clock';
        statusText = 'De postat';
    }
    
    const postedClass = cardClass;
    const postButton = page.postedToday 
        ? `<button class="btn-action btn-unpost" data-id="${page.id}">
                <i class="fas fa-undo"></i> Marchează ca nepostat
           </button>`
        : `<button class="btn-action btn-post" data-id="${page.id}">
                <i class="fas fa-check"></i> Marchează ca postat
           </button>`;

    const deleteWarning = cardClass === 'to-delete' ? `<div style="background: var(--color-delete); color: white; padding: 8px; border-radius: 6px; margin-bottom: 10px; font-size: 0.85em; text-align: center; box-shadow: 0 0 10px var(--glow-red);"><i class="fas fa-exclamation-circle"></i> Pagină inactivă ${daysSincePosted < 999 ? daysSincePosted : daysSinceAdded} zile</div>` : '';
    
    // Avatar sau placeholder
    const avatarHTML = page.avatar 
        ? `<img src="${page.avatar}" alt="${page.name}" class="page-avatar" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
           <div class="page-avatar-placeholder" style="display:none;">${page.name.charAt(0).toUpperCase()}</div>`
        : `<div class="page-avatar-placeholder">${page.name.charAt(0).toUpperCase()}</div>`;
    
    // Mini-preview pentru pagini postate
    const miniPreview = page.postedToday && page.lastPosted ? `
        <div class="mini-preview">
            <div class="mini-preview-header">
                <i class="fas fa-check-circle"></i>
                <span>Publicată cu succes</span>
            </div>
            <div class="mini-preview-text">
                Ultima postare: ${new Date(page.lastPosted).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })}
            </div>
        </div>
    ` : '';
    
    return `
        <div class="page-card ${postedClass}">
            ${deleteWarning}
            <div class="page-header">
                <div class="page-header-left">
                    ${avatarHTML}
                    <div class="page-info">
                        <div class="page-title">${page.name}</div>
                    </div>
                </div>
            </div>
            <div class="page-url">
                <i class="fab fa-facebook"></i>
                <a href="${page.url}" target="_blank">${page.url}</a>
            </div>
            <div class="page-status ${statusClass}">
                <i class="fas ${statusIcon}"></i>
                <span>${statusText}</span>
            </div>
            ${miniPreview}
            <div class="page-actions">
                ${postButton}
                <button class="btn-action btn-visit" data-id="${page.id}">
                    <i class="fas fa-external-link-alt"></i>
                </button>
                <button class="btn-action btn-delete" data-id="${page.id}">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `;
}

// Atașează event listeners pentru butoanele din carduri
function attachPageEventListeners() {
    // Marchează ca postat
    document.querySelectorAll('.btn-post').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = parseInt(e.currentTarget.dataset.id);
            markAsPosted(id);
        });
    });

    // Marchează ca nepostat
    document.querySelectorAll('.btn-unpost').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = parseInt(e.currentTarget.dataset.id);
            markAsUnposted(id);
        });
    });

    // Vizitează pagina
    document.querySelectorAll('.btn-visit').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = parseInt(e.currentTarget.dataset.id);
            const page = pages.find(p => p.id === id);
            if (page) {
                // Deschide pagina
                window.open(page.url, '_blank');
                // Marchează automat ca postat
                markAsPosted(id);
            }
        });
    });

    // Șterge pagina
    document.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = parseInt(e.currentTarget.dataset.id);
            deletePage(id);
        });
    });
}

// Marchează pagina ca postată
function markAsPosted(id) {
    const page = pages.find(p => p.id === id);
    if (page) {
        page.postedToday = true;
        page.lastPosted = new Date().toISOString();
        savePages();
        renderPages();
        updateStats();
        showNotification('Pagină marcată ca postată!', 'success');
    }
}

// Marchează pagina ca nepostată
function markAsUnposted(id) {
    const page = pages.find(p => p.id === id);
    if (page) {
        page.postedToday = false;
        savePages();
        renderPages();
        updateStats();
        showNotification('Pagină marcată ca nepostată', 'info');
    }
}

// Șterge o pagină
function deletePage(id) {
    if (confirm('Ești sigur că vrei să ștergi această pagină?')) {
        pages = pages.filter(p => p.id !== id);
        savePages();
        renderPages();
        updateStats();
        showNotification('Pagină ștearsă cu succes', 'success');
    }
}

// Update statistics
function updateStats() {
    const totalPages = pages.length;
    const postedToday = pages.filter(p => p.postedToday).length;
    const pendingPages = totalPages - postedToday;

    // Animează numerele
    animateNumber('totalPages', totalPages);
    animateNumber('postedToday', postedToday);
    animateNumber('pendingPages', pendingPages);
    
    // Update status live
    updateLiveStatus();
    
    // Update mesaj uman
    updateHumanMessage(postedToday, pendingPages);
}

// Animează numere de la 0 la valoare
function animateNumber(elementId, targetValue) {
    const element = document.getElementById(elementId);
    const currentValue = parseInt(element.textContent) || 0;
    
    if (currentValue === targetValue) return;
    
    element.classList.add('counting');
    
    const duration = 500;
    const steps = 20;
    const increment = (targetValue - currentValue) / steps;
    let current = currentValue;
    let step = 0;
    
    const timer = setInterval(() => {
        step++;
        current += increment;
        element.textContent = Math.round(current);
        
        if (step >= steps) {
            element.textContent = targetValue;
            clearInterval(timer);
            setTimeout(() => element.classList.remove('counting'), 100);
        }
    }, duration / steps);
}

// Update status în timp real
function updateLiveStatus() {
    const lastPostElement = document.getElementById('lastPostTime');
    const nextPostElement = document.getElementById('nextPostTime');
    
    // Găsește ultima postare
    const postedPages = pages.filter(p => p.lastPosted);
    if (postedPages.length > 0) {
        const lastPosted = postedPages.reduce((latest, page) => 
            new Date(page.lastPosted) > new Date(latest.lastPosted) ? page : latest
        );
        
        const timeDiff = Date.now() - new Date(lastPosted.lastPosted);
        const minutes = Math.floor(timeDiff / 60000);
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) {
            lastPostElement.textContent = `acum ${hours} ${hours === 1 ? 'oră' : 'ore'}`;
        } else if (minutes > 0) {
            lastPostElement.textContent = `acum ${minutes} ${minutes === 1 ? 'minut' : 'minute'}`;
        } else {
            lastPostElement.textContent = 'chiar acum';
        }
    } else {
        lastPostElement.textContent = 'nicio postare încă';
    }
    
    // Următoarea postare programată (estimare simplă)
    const pendingCount = pages.filter(p => !p.postedToday).length;
    if (pendingCount > 0) {
        const now = new Date();
        const nextHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1, 0);
        nextPostElement.textContent = nextHour.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
    } else {
        nextPostElement.textContent = 'toate postate';
    }
}

// Mesaje umane
function updateHumanMessage(postedCount, pendingCount) {
    const messageElement = document.getElementById('humanMessage').querySelector('span');
    
    if (pendingCount === 0) {
        messageElement.innerHTML = '<i class="fas fa-party-horn"></i> Felicitări! Ai postat în toate paginile programate.';
    } else if (postedCount === 0) {
        messageElement.innerHTML = `${pendingCount} ${pendingCount === 1 ? 'pagină necesită' : 'pagini necesită'} atenția ta.`;
    } else if (pendingCount === 1) {
        messageElement.innerHTML = 'Aproape gata! Doar 1 pagină mai necesită atenția ta.';
    } else {
        messageElement.innerHTML = `Progres excelent! ${pendingCount} pagini mai așteaptă.`;
    }
}

// Show notification
function showNotification(message, type = 'info') {
    // Creează element notificare
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
        color: white;
        padding: 15px 25px;
        border-radius: 8px;
        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
        z-index: 1000;
        animation: slideIn 0.3s ease;
    `;
    notification.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
        ${message}
    `;

    document.body.appendChild(notification);

    // Remove după 3 secunde
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Adaugă stiluri pentru notificări
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
    .notification i {
        margin-right: 10px;
    }
`;
document.head.appendChild(style);

// Export data (pentru backup)
function exportData() {
    const dataStr = JSON.stringify(pages, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `transvortex_facebook_pages_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
}

// Import data (din backup)
function importData(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const imported = JSON.parse(e.target.result);
            pages = imported;
            savePages();
            renderPages();
            updateStats();
            showNotification('Date importate cu succes!', 'success');
        } catch (error) {
            showNotification('Eroare la importul datelor!', 'error');
        }
    };
    reader.readAsText(file);
}
