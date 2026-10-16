
(function () {
    function initializeSidebar() {
        const dashboard = document.querySelector(".dashboard-page");
        const sidebar = dashboard?.querySelector(":scope > .sidebar");
        const toggle = document.getElementById("sidebarToggle");
        const overlay = document.getElementById("sidebarOverlay");
        const closeButton = document.getElementById("sidebarClose");

        if (!dashboard || !sidebar || !toggle) {
            console.error("لم يتم العثور على القائمة أو زر ☰");
            return;
        }

    
        function isMobile() {
            return window.matchMedia("(max-width: 768px)").matches;
        }

        function openSidebar() {
            if (isMobile()) {
                dashboard.classList.remove("sidebar-collapsed");
                dashboard.classList.add("mobile-sidebar-open");
                sidebar.style.removeProperty("display");
                sidebar.style.setProperty("transform", "translateX(0)", "important");
            } else {
                dashboard.classList.remove("sidebar-collapsed");
                sidebar.style.removeProperty("transform");
                sidebar.style.removeProperty("display");
            }

            toggle.setAttribute("aria-expanded", "true");
        }

        function closeSidebar() {
            dashboard.classList.remove("mobile-sidebar-open");

            if (isMobile()) {
                sidebar.style.setProperty("transform", "translateX(100%)", "important");
            } else {
                dashboard.classList.add("sidebar-collapsed");
                sidebar.style.removeProperty("transform");
            }

            toggle.setAttribute("aria-expanded", "false");
        }

        // الحالة الأولية للقائمة
        closeSidebar();

        // فتح وإغلاق القائمة عند الضغط على ☰
        toggle.addEventListener("click", function (event) {
            event.preventDefault();

            const isOpen = isMobile()
                ? dashboard.classList.contains("mobile-sidebar-open")
                : !dashboard.classList.contains("sidebar-collapsed");

            if (isOpen) {
                closeSidebar();
            } else {
                openSidebar();
            }
        });

        closeButton?.addEventListener("click", closeSidebar);
        overlay?.addEventListener("click", closeSidebar);

        document.addEventListener("keydown", function (event) {
            if (event.key === "Escape") {
                closeSidebar();
            }
        });

        // عند تغيير حجم الشاشة
        window.addEventListener("resize", function () {
            dashboard.classList.remove("mobile-sidebar-open");
            sidebar.style.removeProperty("transform");
            sidebar.style.removeProperty("display");

            if (isMobile()) {
                closeSidebar();
            } else {
                dashboard.classList.remove("sidebar-collapsed");
                toggle.setAttribute("aria-expanded", "true");
            }
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initializeSidebar);
    } else {
        initializeSidebar();
    }
})();
