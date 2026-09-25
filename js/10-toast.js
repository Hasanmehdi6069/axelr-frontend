// js/10-toast.js
// AXELR AI — Global toast system.
(function () {
    "use strict";
    const { escapeHtmlEntities } = window.Axelr;

    function showToast(message, type = 'error') {
        let container = document.getElementById('global-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'global-toast-container';
            container.className = 'toast-container';
            container.style.cssText = `
                position: fixed;
                top: 20px;
                left: 50%;
                transform: translateX(-50%);
                z-index: 999999;
                max-width: 90%;
                pointer-events: none;
                display: flex;
                flex-direction: column;
                gap: 10px;
            `;
            document.documentElement.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        const iconName = type === 'success' ? 'check_circle'
                        : type === 'info' ? 'info'
                        : type === 'warning' ? 'warning'
                        : 'error';

        if (type === 'success') {
            toast.style.borderColor = 'rgba(16,185,129,0.3)';
            toast.style.background = 'rgba(16,185,129,0.15)';
            toast.style.color = '#10b981';
        } else if (type === 'error') {
            toast.style.borderColor = 'rgba(239,68,68,0.3)';
            toast.style.background = 'rgba(239,68,68,0.15)';
            toast.style.color = '#fca5a5';
        } else if (type === 'info') {
            toast.style.borderColor = 'rgba(59,130,246,0.3)';
            toast.style.background = 'rgba(59,130,246,0.15)';
            toast.style.color = '#93c5fd';
        } else if (type === 'warning') {
            toast.style.borderColor = 'rgba(234,179,8,0.3)';
            toast.style.background = 'rgba(234,179,8,0.15)';
            toast.style.color = '#fde047';
        }

        toast.innerHTML = `
            <span class="material-symbols-rounded toast-icon">${iconName}</span>
            <span class="toast-message">${escapeHtmlEntities(message || 'An unexpected error occurred.')}</span>
            <button class="toast-close" title="Dismiss">&times;</button>
        `;

        toast.style.cssText += `
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 14px 28px;
            border-radius: 12px;
            border: 1px solid;
            box-shadow: 0 12px 40px rgba(0,0,0,0.5);
            font-weight: 500;
            font-size: 14px;
            backdrop-filter: blur(12px);
            transform: translateY(-20px);
            opacity: 0;
            transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease;
            pointer-events: auto;
        `;

        const closeBtn = toast.querySelector('.toast-close');
        const dismiss = () => {
            toast.style.transform = 'translateY(-20px)';
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        };

        closeBtn.onclick = (e) => { e.stopPropagation(); dismiss(); };
        toast.addEventListener('click', dismiss);

        container.appendChild(toast);

        requestAnimationFrame(() => {
            toast.style.transform = 'translateY(0)';
            toast.style.opacity = '1';
        });

        setTimeout(dismiss, 5000);
    }

    window.Axelr.showToast = showToast;
    window.showToast = showToast;
})();