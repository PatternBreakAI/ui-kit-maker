/* Shared marketing chrome — the landing footer, rendered identically on
   every subpage, in the visitor's chosen language. The strings are the
   landing's own footer translations (extracted verbatim); the language
   choice lives in ui-generator-lang, the same key the landing header's
   selector writes, so one choice follows the visitor everywhere. */
import { useEffect, useState } from "react";
import type { FormEvent, MouseEvent } from "react";
import { navigate } from "@/shell/router";
import logoUrl from "../../pb-logo.png";
import "@/styles/landing.css";

const DICT: Record<string, Record<string, string>> = {
  "en": {
    "fpTag": "Game-ready UI kits from one master component — drawn by a deterministic engine, never scraped.",
    "fpCopy": "© 2026 PatternBreak. All rights reserved.",
    "fpProdH": "PRODUCT",
    "fpOpen": "Open the generator",
    "fpPricing": "Pricing",
    "fpCommunity": "Community",
    "signin": "Sign in",
    "fpFaq": "FAQ",
    "fpHow": "How it works",
    "fpLegalH": "LEGAL",
    "fpTerms": "Terms of Use",
    "fpPrivacy": "Privacy Policy",
    "fpNewsH": "STAY IN THE LOOP",
    "fpNewsP": "New components, presets, and features — a short email now and then. No spam, unsubscribe anytime.",
    "fpPh": "you@studio.com",
    "fpGo": "SIGN ME UP",
    "fpOk": "You're on the list — welcome aboard.",
    "fpErr": "Hmm, that didn't go through. Mind trying again in a bit?",
    "fpBad": "That email doesn't look quite right.",
    "licN": "* Licensing, in one line: ship your kits inside any game or product — commercial included. The kit and its asset files may not be resold or redistributed as assets, templates, or asset packs. See the Terms of Use."
  },
  "zh": {
    "fpTag": "从一个母版组件生成游戏级 UI 套件——由确定性引擎绘制,绝不抓取他人作品。",
    "fpCopy": "© 2026 PatternBreak。保留所有权利。",
    "fpProdH": "产品",
    "fpOpen": "打开生成器",
    "fpPricing": "价格",
    "fpCommunity": "社区",
    "signin": "登录",
    "fpFaq": "常见问题",
    "fpHow": "工作原理",
    "fpLegalH": "法律",
    "fpTerms": "使用条款",
    "fpPrivacy": "隐私政策",
    "fpNewsH": "保持联系",
    "fpNewsP": "新组件、新预设、新功能——偶尔一封简短邮件。不发垃圾邮件,随时退订。",
    "fpPh": "you@studio.com",
    "fpGo": "订阅",
    "fpOk": "已加入列表——欢迎!",
    "fpErr": "好像没发送成功,稍后再试一次?",
    "fpBad": "这个邮箱看起来不太对。",
    "licN": "* 许可证一句话:可将组件用于任何产品(包括商业产品)——但不得将组件或素材本身作为素材、模板或素材包转售或再分发。详见《使用条款》。"
  },
  "fr": {
    "fpTag": "Des kits UI prêts pour le jeu à partir d'un seul composant maître — dessinés par un moteur déterministe, jamais scrapés.",
    "fpCopy": "© 2026 PatternBreak. Tous droits réservés.",
    "fpProdH": "PRODUIT",
    "fpOpen": "Ouvrir le générateur",
    "fpPricing": "Tarifs",
    "fpCommunity": "Communauté",
    "signin": "Connexion",
    "fpFaq": "FAQ",
    "fpHow": "Comment ça marche",
    "fpLegalH": "LÉGAL",
    "fpTerms": "Conditions d'utilisation",
    "fpPrivacy": "Politique de confidentialité",
    "fpNewsH": "RESTONS EN CONTACT",
    "fpNewsP": "Nouveaux composants, presets et fonctionnalités — un court e-mail de temps en temps. Pas de spam, désinscription à tout moment.",
    "fpPh": "vous@studio.com",
    "fpGo": "JE M'INSCRIS",
    "fpOk": "Vous êtes sur la liste — bienvenue à bord.",
    "fpErr": "Hmm, ça n'est pas passé. On réessaie dans un instant ?",
    "fpBad": "Cet e-mail ne semble pas valide.",
    "licN": "* La licence en une ligne : intégrez vos kits à tout produit, commercial compris — mais le kit et ses assets ne peuvent pas être revendus ni redistribués comme assets, templates ou packs. Voir les Conditions d'utilisation."
  },
  "es": {
    "fpTag": "Kits de UI listos para juego desde un componente maestro — dibujados por un motor determinista, nunca raspados.",
    "fpCopy": "© 2026 PatternBreak. Todos los derechos reservados.",
    "fpProdH": "PRODUCTO",
    "fpOpen": "Abrir el generador",
    "fpPricing": "Precios",
    "fpCommunity": "Comunidad",
    "signin": "Iniciar sesión",
    "fpFaq": "FAQ",
    "fpHow": "Cómo funciona",
    "fpLegalH": "LEGAL",
    "fpTerms": "Términos de uso",
    "fpPrivacy": "Política de privacidad",
    "fpNewsH": "SIGAMOS EN CONTACTO",
    "fpNewsP": "Nuevos componentes, presets y funciones — un correo breve de vez en cuando. Sin spam, date de baja cuando quieras.",
    "fpPh": "tu@estudio.com",
    "fpGo": "APÚNTAME",
    "fpOk": "Ya estás en la lista — ¡bienvenido a bordo!",
    "fpErr": "Hmm, no se envió. ¿Lo intentas de nuevo en un momento?",
    "fpBad": "Ese correo no parece válido.",
    "licN": "* La licencia en una línea: usa tus kits en cualquier producto, comercial incluido — pero el kit y sus assets no pueden revenderse ni redistribuirse como assets, plantillas o packs. Consulta los Términos de Uso."
  },
  "it": {
    "fpTag": "Kit UI pronti per il gioco da un solo componente master — disegnati da un engine deterministico, mai raschiati.",
    "fpCopy": "© 2026 PatternBreak. Tutti i diritti riservati.",
    "fpProdH": "PRODOTTO",
    "fpOpen": "Apri il generatore",
    "fpPricing": "Prezzi",
    "fpCommunity": "Community",
    "signin": "Accedi",
    "fpFaq": "FAQ",
    "fpHow": "Come funziona",
    "fpLegalH": "LEGALE",
    "fpTerms": "Termini d'uso",
    "fpPrivacy": "Informativa privacy",
    "fpNewsH": "RESTIAMO IN CONTATTO",
    "fpNewsP": "Nuovi componenti, preset e funzioni — una breve email ogni tanto. Niente spam, disiscrizione quando vuoi.",
    "fpPh": "tu@studio.com",
    "fpGo": "ISCRIVIMI",
    "fpOk": "Sei in lista — benvenuto a bordo!",
    "fpErr": "Hmm, non è andata. Riprovi tra un attimo?",
    "fpBad": "Questa email non sembra valida.",
    "licN": "* La licenza in una riga: usa i tuoi kit in qualsiasi prodotto, anche commerciale — ma il kit e i suoi asset non possono essere rivenduti né ridistribuiti come asset, template o pacchetti. Vedi i Termini d'Uso."
  },
  "de": {
    "fpTag": "Game-ready UI-Kits aus einer einzigen Master-Komponente — gezeichnet von einer deterministischen Engine, nie gescraped.",
    "fpCopy": "© 2026 PatternBreak. Alle Rechte vorbehalten.",
    "fpProdH": "PRODUKT",
    "fpOpen": "Generator öffnen",
    "fpPricing": "Preise",
    "fpCommunity": "Community",
    "signin": "Anmelden",
    "fpFaq": "FAQ",
    "fpHow": "So funktioniert's",
    "fpLegalH": "RECHTLICHES",
    "fpTerms": "Nutzungsbedingungen",
    "fpPrivacy": "Datenschutzerklärung",
    "fpNewsH": "BLEIB AUF DEM LAUFENDEN",
    "fpNewsP": "Neue Komponenten, Presets und Features — ab und zu eine kurze Mail. Kein Spam, jederzeit abbestellbar.",
    "fpPh": "du@studio.com",
    "fpGo": "EINTRAGEN",
    "fpOk": "Du stehst auf der Liste — willkommen an Bord!",
    "fpErr": "Hmm, das ging nicht durch. Magst du es gleich noch einmal versuchen?",
    "fpBad": "Diese E-Mail sieht nicht richtig aus.",
    "licN": "* Die Lizenz in einem Satz: Nutze deine Kits in jedem Produkt, auch kommerziell — aber das Kit und seine Assets dürfen nicht als Assets, Templates oder Packs weiterverkauft oder weiterverbreitet werden. Siehe Nutzungsbedingungen."
  },
  "ja": {
    "fpTag": "ひとつのマスターコンポーネントからゲーム対応の UI キットを — 決定論的エンジンが描画。スクレイピングは一切なし。",
    "fpCopy": "© 2026 PatternBreak. All rights reserved.",
    "fpProdH": "プロダクト",
    "fpOpen": "ジェネレーターを開く",
    "fpPricing": "料金",
    "fpCommunity": "コミュニティ",
    "signin": "ログイン",
    "fpFaq": "よくある質問",
    "fpHow": "仕組み",
    "fpLegalH": "法的情報",
    "fpTerms": "利用規約",
    "fpPrivacy": "プライバシーポリシー",
    "fpNewsH": "最新情報を受け取る",
    "fpNewsP": "新コンポーネント・プリセット・機能のお知らせを、ときどき短いメールで。スパムなし、いつでも解除できます。",
    "fpPh": "you@studio.com",
    "fpGo": "登録する",
    "fpOk": "リストに追加しました — ようこそ!",
    "fpErr": "送信できなかったようです。少し後にもう一度お試しください。",
    "fpBad": "メールアドレスの形式が正しくないようです。",
    "licN": "* ライセンスを一行で:キットはどんな製品にも(商用含め)使えます——ただしキットや素材そのものを素材・テンプレート・素材パックとして転売・再配布することはできません。詳細は利用規約へ。"
  }
};

export const CHROME_LANGS: [string, string][] =
  [["en", "EN"], ["zh", "中文"], ["fr", "FR"], ["es", "ES"], ["it", "IT"], ["de", "DE"], ["ja", "日本語"]];

export function getLang(): string {
  try { const l = localStorage.getItem("ui-generator-lang") || "en"; return DICT[l] ? l : "en"; }
  catch { return "en"; }
}

export function useLang(): [string, (l: string) => void] {
  const [lang, set] = useState(getLang);
  useEffect(() => {
    const f = () => set(getLang());
    window.addEventListener("ui-generator:lang", f);
    return () => window.removeEventListener("ui-generator:lang", f);
  }, []);
  return [lang, (l: string) => {
    try { localStorage.setItem("ui-generator-lang", l); } catch { /* private mode */ }
    document.documentElement.lang = l === "zh" ? "zh-Hans" : l;
    window.dispatchEvent(new Event("ui-generator:lang"));
  }];
}

export function MarketingFooter() {
  const [lang, setLang] = useLang();
  const t = (k: string) => DICT[lang]?.[k] ?? DICT.en[k] ?? k;
  const [note, setNote] = useState<{ msg: string; err?: boolean } | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const go = (to: string) => (e: MouseEvent) => { e.preventDefault(); navigate(to); };
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const v = String(fd.get("email") || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { setNote({ msg: t("fpBad"), err: true }); return; }
    setBusy(true);
    fetch("/api/subscribe", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: v, source: "footer", locale: lang, website: String(fd.get("website") || "") }) })
      .then((r) => { if (!r.ok && r.status !== 409) throw new Error(); setDone(true); setNote({ msg: t("fpOk") }); })
      .catch(() => setNote({ msg: t("fpErr"), err: true }))
      .finally(() => setBusy(false));
  };
  return (
    <div className="fd-landing fd-chrome">
      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-grid">
            <div className="footer-col footer-colbrand">
              <div className="footer-brand">
                <img className="brand-mark" src={logoUrl} alt="" width={26} height={26} />
                <span><strong>UI Kit Maker</strong> by PatternBreak</span>
              </div>
              <p className="footer-tag">{t("fpTag")}</p>
              <p className="footer-copy">{t("fpCopy")}</p>
            </div>
            <nav className="footer-col" aria-label={t("fpProdH")}>
              <h4>{t("fpProdH")}</h4>
              <a href="#/app" onClick={go("#/app")}>{t("fpOpen")}</a>
              <a href="#/pricing" onClick={go("#/pricing")}>{t("fpPricing")}</a>
              <a href="#/community" onClick={go("#/community")}>{t("fpCommunity")}</a>
              <a href="#/signin" onClick={go("#/signin")}>{t("signin")}</a>
              <a href="#/faq" onClick={go("#/faq")}>{t("fpFaq")}</a>
        <a href="#/releases" onClick={go("#/releases")}>Release notes</a>
              <a href="#/how" onClick={go("#/how")}>{t("fpHow")}</a>
            </nav>
            <nav className="footer-col" aria-label={t("fpLegalH")}>
              <h4>{t("fpLegalH")}</h4>
              <a href="#/terms" onClick={go("#/terms")}>{t("fpTerms")}</a>
              <a href="#/privacy" onClick={go("#/privacy")}>{t("fpPrivacy")}</a>
            </nav>
            <div className="footer-col footer-colnews">
              <h4>{t("fpNewsH")}</h4>
              <p className="footer-newsp">{t("fpNewsP")}</p>
              {!done && (
                <form className="footer-news" onSubmit={submit} noValidate>
                  <input type="email" name="email" placeholder={t("fpPh")} autoComplete="email" aria-label="Email address" />
                  <input type="text" name="website" className="fp-hp" tabIndex={-1} autoComplete="off" aria-hidden="true" />
                  <button type="submit" disabled={busy}>{t("fpGo")}</button>
                </form>
              )}
              {note && <p className="footer-note" data-err={note.err ? "1" : undefined}>{note.msg}</p>}
            </div>
          </div>
          <div className="footer-bottom">
            <p className="footer-lic">{t("licN")}</p>
            <select className="fd-chrome__lang" value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Language">
              {CHROME_LANGS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
            </select>
          </div>
        </div>
      </footer>
    </div>
  );
}
