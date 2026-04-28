(function() {
    var THEME_KEY = 'zebraWebPrintTheme';
    var sunIcon = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="m4.93 4.93 1.41 1.41"></path><path d="m17.66 17.66 1.41 1.41"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="m6.34 17.66-1.41 1.41"></path><path d="m19.07 4.93-1.41 1.41"></path></svg>';
    var moonIcon = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.99 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 20.99 12.79z"></path></svg>';

    function preferredTheme() {
        var storedTheme = localStorage.getItem(THEME_KEY);
        if(storedTheme === 'light' || storedTheme === 'dark') {
            return storedTheme;
        }

        if(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return 'dark';
        }

        return 'light';
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);

        var button = document.getElementById('theme_toggle');
        if(button) {
            var nextTheme = theme === 'dark' ? 'light' : 'dark';
            button.innerHTML = theme === 'dark' ? sunIcon : moonIcon;
            button.setAttribute('aria-label', 'Switch to ' + nextTheme + ' mode');
            button.setAttribute('title', 'Switch to ' + nextTheme + ' mode');
            button.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
        }
    }

    window.toggleTheme = function() {
        var currentTheme = document.documentElement.getAttribute('data-theme') || preferredTheme();
        var nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
        localStorage.setItem(THEME_KEY, nextTheme);
        applyTheme(nextTheme);
    };

    document.addEventListener('DOMContentLoaded', function() {
        applyTheme(preferredTheme());
    });
})();
