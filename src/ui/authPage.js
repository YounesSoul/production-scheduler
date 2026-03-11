/* ═══════════════════════════════════════════════════
   AUTH PAGE — Supabase email/password login & signup
   Modern Split-Screen UI with Glassmorphism
   ═══════════════════════════════════════════════════ */

import { supabase } from '../data/supabase.js';

export function renderAuthPage(initialError = null) {
    // Inject custom styles for this page (floating labels, animations)
    const styleId = 'auth-page-styles';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&family=Inter:wght@400;500;600&display=swap');
            
            * { box-sizing: border-box; }
            body, html { margin: 0; padding: 0; font-family: 'Inter', sans-serif; background: #050505; color: #fff; }
            
            .auth-layout {
                display: flex;
                min-height: 100vh;
                width: 100%;
                overflow: hidden;
                position: relative;
            }

            /* Interactive Canvas Background - Full Screen */
            #bg-canvas {
                position: absolute;
                inset: 0;
                width: 100%;
                height: 100%;
                z-index: 0;
                pointer-events: auto;
            }
            .saas-grid-fade {
                position: absolute;
                inset: 0;
                background: radial-gradient(circle at 50% 50%, transparent 10%, #000000 90%);
                z-index: 1;
                pointer-events: none;
            }

            /* Left Side - Brand & Graphics */
            .auth-hero {
                flex: 1;
                display: none;
                position: relative;
                overflow: hidden;
                align-items: center;
                justify-content: center;
                padding: 40px;
                border-right: 1px solid rgba(255, 255, 255, 0.2); /* Visual divider line - More visible */
                z-index: 5;
            }
            @media (min-width: 900px) {
                .auth-hero { display: flex; }
            }



            .hero-content {
                position: relative;
                z-index: 10;
                max-width: 520px;
                background: rgba(15, 15, 15, 0.4);
                border: 1px solid rgba(255, 255, 255, 0.1);
                backdrop-filter: blur(24px);
                -webkit-backdrop-filter: blur(24px);
                padding: 56px;
                border-radius: 24px;
                box-shadow: 0 30px 60px rgba(0,0,0,0.6);
            }
            .feature-badge {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                padding: 6px 14px;
                background: rgba(31, 111, 235, 0.15);
                border: 1px solid rgba(31, 111, 235, 0.3);
                border-radius: 100px;
                color: #58a6ff;
                font-size: 0.85rem;
                font-weight: 600;
                margin-bottom: 24px;
                letter-spacing: 0.02em;
            }
            .hero-content h1 {
                font-family: 'Outfit', sans-serif;
                font-size: 3.2rem;
                font-weight: 700;
                margin: 0 0 16px;
                background: linear-gradient(135deg, #ffffff 0%, #a5b4fc 100%);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                line-height: 1.1;
                letter-spacing: -0.02em;
            }
            .hero-content p {
                font-size: 1.15rem;
                color: #9ca3af;
                line-height: 1.6;
                margin: 0 0 32px 0;
            }
            
            /* Abstract Graphic / Metric */
            .abstract-metric {
                display: flex;
                align-items: center;
                gap: 24px;
                padding-top: 32px;
                border-top: 1px solid rgba(255,255,255,0.08);
            }
            .metric-stat {
                font-family: 'Outfit', sans-serif;
                font-size: 2.8rem;
                font-weight: 700;
                color: #fff;
                line-height: 1;
                background: linear-gradient(to right, #ffffff, #8b949e);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
            }
            .metric-label {
                color: #8b949e;
                font-size: 0.9rem;
                font-weight: 500;
                line-height: 1.4;
                margin-top: 4px;
            }
            .metric-graph {
                display: flex;
                align-items: flex-end;
                gap: 6px;
                height: 48px;
            }
            .graph-bar {
                width: 12px;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 4px;
                position: relative;
                overflow: hidden;
            }
            .graph-fill {
                position: absolute;
                bottom: 0;
                left: 0;
                width: 100%;
                background: linear-gradient(180deg, #1f6feb 0%, #1158c7 100%);
                border-radius: 4px;
                animation: growBar 1.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                transform-origin: bottom;
                transform: scaleY(0);
            }
            
            /* Staggered animation delays for the bars */
            .graph-bar:nth-child(1) .graph-fill { height: 40%; animation-delay: 0.1s; background: linear-gradient(180deg, #8b949e 0%, #30363d 100%); }
            .graph-bar:nth-child(2) .graph-fill { height: 60%; animation-delay: 0.2s; background: linear-gradient(180deg, #8b949e 0%, #30363d 100%); }
            .graph-bar:nth-child(3) .graph-fill { height: 45%; animation-delay: 0.3s; background: linear-gradient(180deg, #8b949e 0%, #30363d 100%); }
            .graph-bar:nth-child(4) .graph-fill { height: 80%; animation-delay: 0.4s; background: linear-gradient(180deg, #8b949e 0%, #30363d 100%); }
            .graph-bar:nth-child(5) .graph-fill { height: 98%; animation-delay: 0.6s; background: linear-gradient(180deg, #1f6feb 0%, #00d2ff 100%); box-shadow: 0 0 12px rgba(31, 111, 235, 0.4); }

            @keyframes growBar {
                0% { transform: scaleY(0); }
                100% { transform: scaleY(1); }
            }

            /* Right Side - Form */
            .auth-form-container {
                flex: 1;
                max-width: 100%;
                display: flex;
                flex-direction: column;
                justify-content: center;
                padding: 40px 24px;
                background: rgba(5, 5, 5, 0.7); /* make slightly transparent so canvas shows through */
                backdrop-filter: blur(16px);
                -webkit-backdrop-filter: blur(16px);
                position: relative;
                z-index: 20;
            }
            @media (min-width: 900px) {
                .auth-form-container { max-width: 480px; padding: 60px 48px; box-shadow: -20px 0 50px rgba(0,0,0,0.5); }
            }

            .form-wrapper {
                width: 100%;
                max-width: 380px;
                margin: 0 auto;
                animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1);
            }

            @keyframes slideUp {
                0% { opacity: 0; transform: translateY(20px); }
                100% { opacity: 1; transform: translateY(0); }
            }

            .mobile-logo {
                display: block;
                font-size: 2.5rem;
                margin-bottom: 24px;
                text-align: center;
            }
            @media (min-width: 900px) {
                .mobile-logo { display: none; }
            }

            .form-header {
                margin-bottom: 32px;
                text-align: left;
            }
            .form-header h2 {
                font-family: 'Outfit', sans-serif;
                font-size: 2rem;
                margin: 0 0 8px;
                color: #ffffff;
            }
            .form-header p {
                color: #9ca3af;
                font-size: 0.95rem;
                margin: 0;
            }

            /* Floating Label Inputs */
            .input-group {
                position: relative;
                margin-bottom: 24px;
            }
            .input-group input {
                width: 100%;
                padding: 16px 16px 16px 16px;
                background: rgba(255, 255, 255, 0.02);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 12px;
                color: #fff;
                font-size: 1rem;
                font-family: inherit;
                outline: none;
                transition: all 0.3s ease;
                box-shadow: 0 4px 6px rgba(0,0,0,0.05) inset;
            }
            .input-group input:hover {
                border-color: rgba(255, 255, 255, 0.15);
                background: rgba(255, 255, 255, 0.04);
            }
            .input-group input:focus {
                border-color: #58a6ff;
                background: rgba(31, 111, 235, 0.03);
                box-shadow: 0 0 0 3px rgba(31, 111, 235, 0.2), 0 4px 6px rgba(0,0,0,0.05) inset;
            }
            .input-group label {
                position: absolute;
                left: 16px;
                top: 50%;
                transform: translateY(-50%);
                color: #8b949e;
                font-size: 1rem;
                pointer-events: none;
                transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
            }
            /* Move label up when focused or not empty */
            .input-group input:focus ~ label,
            .input-group input:not(:placeholder-shown) ~ label {
                top: 0;
                transform: translateY(-50%) scale(0.85);
                left: 12px;
                padding: 0 4px;
                background: #050505;
                color: #58a6ff;
                letter-spacing: 0.02em;
            }

            /* Primary Button */
            .btn-primary {
                width: 100%;
                padding: 16px;
                background: #fff;
                color: #050505;
                border: 1px solid rgba(255,255,255,0.1);
                border-radius: 12px;
                font-size: 1rem;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
                font-family: inherit;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
            }
            .btn-primary:hover {
                transform: translateY(-2px);
                background: #f0f6fc;
                box-shadow: 0 8px 16px rgba(255, 255, 255, 0.15);
            }
            .btn-primary:active {
                 transform: translateY(0);
                 box-shadow: none;
            }
            .btn-primary:disabled {
                opacity: 0.6;
                cursor: not-allowed;
                transform: none;
                box-shadow: none;
            }

            /* Secondary / Social Button Style */
            .btn-secondary {
                 width: 100%;
                 padding: 16px;
                 background: rgba(255,255,255,0.03);
                 color: #fff;
                 border: 1px solid rgba(255,255,255,0.1);
                 border-radius: 12px;
                 font-size: 0.95rem;
                 font-weight: 500;
                 cursor: pointer;
                 transition: all 0.2s;
                 display: flex;
                 align-items: center;
                 justify-content: center;
                 gap: 12px;
                 margin-top: 16px;
            }
            .btn-secondary:hover {
                 background: rgba(255,255,255,0.08);
            }

            /* Divider */
            .divider {
                display: flex;
                align-items: center;
                text-align: center;
                color: #6b7280;
                font-size: 0.85rem;
                margin: 24px 0;
            }
            .divider::before, 
            .divider::after {
                content: '';
                flex: 1;
                border-bottom: 1px solid rgba(255,255,255,0.1);
            }
            .divider:not(:empty)::before { margin-right: 16px; }
            .divider:not(:empty)::after { margin-left: 16px; }

            /* Text Links */
            .text-link {
                color: #8b949e;
                text-decoration: none;
                font-weight: 500;
                cursor: pointer;
                transition: color 0.2s;
                background: none;
                border: none;
                padding: 0;
                font-size: inherit;
                font-family: inherit;
            }
            .text-link:hover { color: #fff; }

            .auth-footer {
                margin-top: 32px;
                text-align: center;
                color: #6b7280;
                font-size: 0.95rem;
            }

            /* Alerts */
            .alert {
                padding: 14px 16px;
                border-radius: 12px;
                margin-bottom: 24px;
                font-size: 0.9rem;
                display: none;
                animation: slideDown 0.3s ease;
            }
            @keyframes slideDown {
                0% { opacity: 0; transform: translateY(-10px); }
                100% { opacity: 1; transform: translateY(0); }
            }
            .alert-error {
                background: rgba(248, 81, 73, 0.1);
                border: 1px solid rgba(248, 81, 73, 0.3);
                color: #ff7b72;
            }
            .alert-success {
                background: rgba(46, 160, 67, 0.1);
                border: 1px solid rgba(46, 160, 67, 0.3);
                color: #56d364;
            }

            /* Password toggle */
            .pwd-toggle {
                position: absolute;
                right: 16px;
                top: 50%;
                transform: translateY(-50%);
                cursor: pointer;
                color: #6b7280;
                transition: color 0.2s;
                display: flex;
                align-items: center;
                background: transparent;
                border: none;
                padding: 4px;
            }
            .pwd-toggle:hover { color: #fff; }
            .input-group input[type="password"] { padding-right: 48px; }

            /* Utility classes */
            .hidden { display: none !important; }
            .flex-between { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;}
        `;
        document.head.appendChild(style);
    }

    document.body.innerHTML = `
    <div class="auth-layout">
        <!-- Full Screen Background -->
        <canvas id="bg-canvas"></canvas>
        <div class="saas-grid-fade"></div>

        <!-- Brand Side -->
        <div class="auth-hero">
            <div class="hero-content">
                <div class="feature-badge">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
                    Gestion Industrielle Sécurisée
                </div>
                <h1>Planificateur<br>de Production</h1>
                <p>Gérez vos chaînes de production textile avec une efficacité et une précision de niveau industriel.</p>
                <div class="abstract-metric">
                    <div>
                        <div class="metric-stat">100%</div>
                        <div class="metric-label">Work, no wasted time.</div>
                    </div>
                    <div class="metric-graph">
                        <div class="graph-bar"><div class="graph-fill"></div></div>
                        <div class="graph-bar"><div class="graph-fill"></div></div>
                        <div class="graph-bar"><div class="graph-fill"></div></div>
                        <div class="graph-bar"><div class="graph-fill"></div></div>
                        <div class="graph-bar"><div class="graph-fill"></div></div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Form Side -->
        <div class="auth-form-container">
            <div class="form-wrapper">
                
                <div class="mobile-logo">🧵</div>

                <!-- LOGIN VIEW -->
                <div id="view-login">
                    <div class="form-header">
                        <h2>Bon retour</h2>
                        <p>Connectez-vous pour accéder à votre espace.</p>
                    </div>

                    <div id="login-error" class="alert alert-error"></div>
                    <div id="login-success" class="alert alert-success"></div>

                    <form id="login-form" onsubmit="authLogin(event)">
                        <button type="button" class="btn-secondary" onclick="authOAuth('google')">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                            Continuer avec Google
                        </button>
                        
                        <div class="divider">ou continuer avec l'e-mail</div>

                        <div class="input-group">
                            <input type="email" id="login-email" required autocomplete="email" placeholder=" ">
                            <label for="login-email">Adresse e-mail</label>
                        </div>
                        
                        <div class="input-group" style="margin-bottom: 12px;">
                            <input type="password" id="login-password" required autocomplete="current-password" placeholder=" ">
                            <label for="login-password">Mot de passe</label>
                            <button type="button" class="pwd-toggle" onclick="togglePwd('login-password')" tabindex="-1">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="eye-icon"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                            </button>
                        </div>

                        <div class="flex-between">
                            <button type="button" class="text-link" style="font-size: 0.85rem;" onclick="authSwitchView('reset')">Mot de passe oublié ?</button>
                        </div>

                        <button type="submit" id="login-btn" class="btn-primary">
                            Se connecter
                        </button>
                    </form>

                    <div class="auth-footer">
                        Pas encore de compte ? <button class="text-link" style="color: #fff;" onclick="authSwitchView('signup')">S'inscrire</button>
                    </div>
                </div>

                <!-- SIGNUP VIEW -->
                <div id="view-signup" class="hidden">
                    <div class="form-header">
                        <h2>Créer un compte</h2>
                        <p>Commencez à optimiser votre production.</p>
                    </div>

                    <div id="signup-error" class="alert alert-error"></div>
                    <div id="signup-success" class="alert alert-success"></div>

                    <form id="signup-form" onsubmit="authSignup(event)">
                        <button type="button" class="btn-secondary" onclick="authOAuth('google')">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                            S'inscrire avec Google
                        </button>
                        
                        <div class="divider">ou continuer avec l'e-mail</div>

                        <div class="input-group">
                            <input type="email" id="signup-email" required autocomplete="email" placeholder=" ">
                            <label for="signup-email">Adresse e-mail</label>
                        </div>
                        
                        <div class="input-group">
                            <input type="password" id="signup-password" required autocomplete="new-password" placeholder=" ">
                            <label for="signup-password">Mot de passe</label>
                            <button type="button" class="pwd-toggle" onclick="togglePwd('signup-password')" tabindex="-1">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="eye-icon"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                            </button>
                        </div>

                        <div class="input-group" style="margin-bottom: 32px;">
                            <input type="password" id="signup-confirm" required autocomplete="new-password" placeholder=" ">
                            <label for="signup-confirm">Confirmer le mot de passe</label>
                        </div>

                        <button type="submit" id="signup-btn" class="btn-primary">
                            Créer le compte
                        </button>
                    </form>

                    <div class="auth-footer">
                        Vous avez déjà un compte ? <button class="text-link" style="color: #fff;" onclick="authSwitchView('login')">Se connecter</button>
                    </div>
                </div>

                <!-- RESET PWD VIEW -->
                <div id="view-reset" class="hidden">
                    <div class="form-header">
                        <h2>Réinitialisation</h2>
                        <p>Entrez votre e-mail pour recevoir un lien de réinitialisation.</p>
                    </div>

                    <div id="reset-error" class="alert alert-error"></div>
                    <div id="reset-success" class="alert alert-success"></div>

                    <form id="reset-form" onsubmit="authResetPwd(event)">
                        <div class="input-group" style="margin-bottom: 32px;">
                            <input type="email" id="reset-email" required autocomplete="email" placeholder=" ">
                            <label for="reset-email">Adresse e-mail</label>
                        </div>

                        <button type="submit" id="reset-btn" class="btn-primary">
                            Envoyer le lien
                        </button>
                    </form>

                    <div class="auth-footer">
                        <button class="text-link" onclick="authSwitchView('login')">← Retour à la connexion</button>
                    </div>
                </div>

            </div>
        </div>
    </div>`;

    if (initialError) {
        showMsg('login', 'error', initialError + ' — Le lien a expiré. Veuillez réessayer.');
    }

    // --- Global View Switcher ---
    window.authSwitchView = (view) => {
        ['login', 'signup', 'reset'].forEach(v => {
            document.getElementById('view-' + v).classList.add('hidden');
            hideMsg(v, 'error');
            hideMsg(v, 'success');
        });
        document.getElementById('view-' + view).classList.remove('hidden');

        // Add tiny animation re-trigger
        const wrapper = document.querySelector('.form-wrapper');
        wrapper.style.animation = 'none';
        wrapper.offsetHeight; /* trigger reflow */
        wrapper.style.animation = 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)';
    };

    // --- Global Password Toggle ---
    window.togglePwd = (inputId) => {
        const input = document.getElementById(inputId);
        const icon = input.nextElementSibling.nextElementSibling.querySelector('svg');
        if (input.type === 'password') {
            input.type = 'text';
            icon.innerHTML = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>';
        } else {
            input.type = 'password';
            icon.innerHTML = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>';
        }
    };

    // --- Messaging Helpers ---
    function showMsg(view, type, text) {
        const el = document.getElementById(view + '-' + type);
        if (el) { el.textContent = type === 'error' ? '⚠ ' + text : '✅ ' + text; el.style.display = 'block'; }
    }
    function hideMsg(view, type) {
        const el = document.getElementById(view + '-' + type);
        if (el) { el.style.display = 'none'; el.textContent = ''; }
    }

    // --- OAuth Integration ---
    window.authOAuth = async (provider) => {
        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: provider,
            options: {
                redirectTo: window.location.origin
            }
        });
        if (error) {
            showMsg('login', 'error', 'Erreur de connexion ' + provider + ': ' + error.message);
        }
    };

    // --- Login Form ---
    window.authLogin = async (e) => {
        e.preventDefault();
        hideMsg('login', 'error');
        const btn = document.getElementById('login-btn');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner" style="width:16px;height:16px;border:2px solid #fff;border-bottom-color:transparent;border-radius:50%;display:inline-block;animation:spin 1s linear infinite;"></span> Connexion...';

        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;

        const { error } = await supabase.auth.signInWithPassword({ email, password });

        if (error) {
            showMsg('login', 'error', 'Identifiants incorrects ou erreur réseau.');
            btn.disabled = false;
            btn.innerHTML = 'Se connecter';
        } else {
            window.location.reload();
        }
    };

    // --- Signup Form ---
    window.authSignup = async (e) => {
        e.preventDefault();
        hideMsg('signup', 'error');
        const btn = document.getElementById('signup-btn');
        const password = document.getElementById('signup-password').value;
        const confirm = document.getElementById('signup-confirm').value;

        if (password !== confirm) {
            showMsg('signup', 'error', 'Les mots de passe ne correspondent pas.');
            return;
        }
        if (password.length < 8) {
            showMsg('signup', 'error', 'Le mot de passe doit contenir au moins 8 caractères.');
            return;
        }

        btn.disabled = true;
        btn.innerHTML = '<span class="spinner" style="width:16px;height:16px;border:2px solid #fff;border-bottom-color:transparent;border-radius:50%;display:inline-block;animation:spin 1s linear infinite;"></span> Création...';

        const email = document.getElementById('signup-email').value.trim();
        const { error } = await supabase.auth.signUp({ email, password });

        btn.disabled = false;
        btn.innerHTML = 'Créer le compte';

        if (error) {
            showMsg('signup', 'error', error.message);
        } else {
            showMsg('signup', 'success', 'Création réussie. Si la confirmation email est activée, veuillez vérifier votre boîte de réception.');
            // Clear passwords
            document.getElementById('signup-password').value = '';
            document.getElementById('signup-confirm').value = '';
        }
    };

    // --- Password Reset Form ---
    window.authResetPwd = async (e) => {
        e.preventDefault();
        hideMsg('reset', 'error');
        hideMsg('reset', 'success');

        const btn = document.getElementById('reset-btn');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner" style="width:16px;height:16px;border:2px solid #fff;border-bottom-color:transparent;border-radius:50%;display:inline-block;animation:spin 1s linear infinite;"></span> Envoi...';

        const email = document.getElementById('reset-email').value.trim();
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin
        });

        btn.disabled = false;
        btn.innerHTML = 'Envoyer le lien';

        if (error) {
            showMsg('reset', 'error', error.message);
        } else {
            showMsg('reset', 'success', 'Si ce compte existe, un lien de réinitialisation a été envoyé.');
            document.getElementById('reset-email').value = '';
        }
    };

    // Add spinner keyframes globally if not exists
    if (!document.getElementById('spinner-keyframes')) {
        const s = document.createElement('style');
        s.id = 'spinner-keyframes';
        s.textContent = '@keyframes spin { 100% { transform: rotate(360deg); } }';
        document.head.appendChild(s);
    }

    // --- Interactive Background (React Bits Inspired) ---
    setTimeout(() => {
        const canvas = document.getElementById('bg-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let width = canvas.offsetWidth;
        let height = canvas.offsetHeight;
        canvas.width = width;
        canvas.height = height;

        const particles = [];
        const mouse = { x: -1000, y: -1000, radius: 180 };

        window.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            mouse.x = e.clientX - rect.left;
            mouse.y = e.clientY - rect.top;
        });
        window.addEventListener('mouseleave', () => {
            mouse.x = -1000; mouse.y = -1000;
        });

        window.addEventListener('resize', () => {
            if (!canvas.parentElement) return;
            width = canvas.parentElement.offsetWidth;
            height = canvas.parentElement.offsetHeight;
            canvas.width = width;
            canvas.height = height;
        });

        class Particle {
            constructor() {
                this.x = Math.random() * width;
                this.y = Math.random() * height;
                this.vx = (Math.random() - 0.5) * 0.4;
                this.vy = (Math.random() - 0.5) * 0.4;
                this.baseRadius = Math.random() * 2 + 1; /* Larger dots */
                this.color = `rgba(88, 166, 255, ${Math.random() * 0.5 + 0.3})`; /* Much brighter dots */
            }
            update() {
                this.x += this.vx;
                this.y += this.vy;

                if (this.x < 0 || this.x > width) this.vx *= -1;
                if (this.y < 0 || this.y > height) this.vy *= -1;

                // Interactive mouse repel
                const dx = mouse.x - this.x;
                const dy = mouse.y - this.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance < mouse.radius) {
                    const force = (mouse.radius - distance) / mouse.radius;
                    this.x -= dx * force * 0.05;
                    this.y -= dy * force * 0.05;
                }
            }
            draw() {
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.baseRadius, 0, Math.PI * 2);
                ctx.fillStyle = this.color;
                ctx.fill();
            }
        }

        // Initialize particles
        const particleCount = window.innerWidth > 900 ? 120 : 60;
        for (let i = 0; i < particleCount; i++) particles.push(new Particle());

        function animate() {
            // Check if still in DOM
            if (!document.getElementById('bg-canvas')) return;

            ctx.clearRect(0, 0, width, height);

            // Draw connections
            for (let i = 0; i < particles.length; i++) {
                for (let j = i + 1; j < particles.length; j++) {
                    const dx = particles[i].x - particles[j].x;
                    const dy = particles[i].y - particles[j].y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < 180) { /* Increased connection radius */
                        ctx.beginPath();
                        ctx.strokeStyle = `rgba(88, 166, 255, ${0.4 * (1 - dist / 180)})`; /* Thicker, brighter lines */
                        ctx.lineWidth = 1.5;
                        ctx.moveTo(particles[i].x, particles[i].y);
                        ctx.lineTo(particles[j].x, particles[j].y);
                        ctx.stroke();
                    }
                }
                particles[i].update();
                particles[i].draw();
            }

            // Draw interactive mouse glow
            if (mouse.x > 0) {
                const gradient = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, 500);
                gradient.addColorStop(0, 'rgba(88, 166, 255, 0.18)'); /* Brighter glow */
                gradient.addColorStop(1, 'transparent');
                ctx.fillStyle = gradient;
                ctx.fillRect(0, 0, width, height);
            }

            requestAnimationFrame(animate);
        }
        animate();
    }, 0);
}
