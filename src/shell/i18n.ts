/* The app inherits the front door's language.

   The homepage persists an explicit language choice as `ui-generator-lang`
   (localStorage — the same place every preference in this product lives,
   synced to the cloud workspace when signed in). Until now only the
   marketing pages read it; the editor spoke English regardless. This
   module is the editor's side of that promise.

   Shape: a flat string table per locale, English as both the source of
   truth and the fallback — a missing key NEVER breaks the UI, it just
   speaks English for that string. Keys are added surface by surface (the
   TopBar first); docs/editability-audit.md carries the phasing.

   The seven locales are the front door's seven. Anything else stored
   falls back to English. */

export type Locale = "en" | "zh" | "fr" | "es" | "it" | "de" | "ja";

const LOCALES: Locale[] = ["en", "zh", "fr", "es", "it", "de", "ja"];

export function currentLocale(): Locale {
  try {
    const l = localStorage.getItem("ui-generator-lang");
    if (l && (LOCALES as string[]).includes(l)) return l as Locale;
  } catch { /* private mode */ }
  return "en";
}

type Table = Record<string, string>;

const EN: Table = {
  export: "Export",
  exportSvg: "Export SVG",
  exportPng: "Export PNG",
  downloadHtml: "Download HTML",
  copySvg: "Copy SVG code",
  exportGameKit: "Export game kit",
  exportSettings: "Export settings",
  importSettings: "Import settings…",
  resetComponent: "Reset component",
  saved: "Saved",
  saving: "Saving…",
  syncing: "Syncing…",
  savedLocal: "Saved — this browser only",
  localNote: "Your work is saved only in this browser — clearing browser data would erase it. Sign in (free) and it syncs to your account.",
  account: "Account",
  backHome: "Back to home",
  exportAndSettings: "Export and settings",
};

const ZH: Table = {
  export: "导出",
  exportSvg: "导出 SVG",
  exportPng: "导出 PNG",
  downloadHtml: "下载 HTML",
  copySvg: "复制 SVG 代码",
  exportGameKit: "导出游戏套件",
  exportSettings: "导出设置",
  importSettings: "导入设置…",
  resetComponent: "重置组件",
  saved: "已保存",
  saving: "保存中…",
  syncing: "同步中…",
  savedLocal: "已保存 — 仅限此浏览器",
  localNote: "你的作品只保存在此浏览器中——清除浏览器数据会将其删除。登录（免费）即可同步到你的账户。",
  account: "账户",
  backHome: "返回首页",
  exportAndSettings: "导出与设置",
};

const FR: Table = {
  export: "Exporter",
  exportSvg: "Exporter en SVG",
  exportPng: "Exporter en PNG",
  downloadHtml: "Télécharger le HTML",
  copySvg: "Copier le code SVG",
  exportGameKit: "Exporter le kit de jeu",
  exportSettings: "Exporter les réglages",
  importSettings: "Importer des réglages…",
  resetComponent: "Réinitialiser le composant",
  saved: "Enregistré",
  saving: "Enregistrement…",
  syncing: "Synchronisation…",
  savedLocal: "Enregistré — ce navigateur uniquement",
  localNote: "Votre travail n'est enregistré que dans ce navigateur — effacer les données du navigateur l'effacerait. Connectez-vous (gratuit) pour le synchroniser avec votre compte.",
  account: "Compte",
  backHome: "Retour à l'accueil",
  exportAndSettings: "Export et réglages",
};

const ES: Table = {
  export: "Exportar",
  exportSvg: "Exportar SVG",
  exportPng: "Exportar PNG",
  downloadHtml: "Descargar HTML",
  copySvg: "Copiar código SVG",
  exportGameKit: "Exportar kit de juego",
  exportSettings: "Exportar ajustes",
  importSettings: "Importar ajustes…",
  resetComponent: "Restablecer componente",
  saved: "Guardado",
  saving: "Guardando…",
  syncing: "Sincronizando…",
  savedLocal: "Guardado — solo en este navegador",
  localNote: "Tu trabajo solo se guarda en este navegador: borrar los datos del navegador lo eliminaría. Inicia sesión (gratis) y se sincroniza con tu cuenta.",
  account: "Cuenta",
  backHome: "Volver al inicio",
  exportAndSettings: "Exportación y ajustes",
};

const IT: Table = {
  export: "Esporta",
  exportSvg: "Esporta SVG",
  exportPng: "Esporta PNG",
  downloadHtml: "Scarica HTML",
  copySvg: "Copia codice SVG",
  exportGameKit: "Esporta kit di gioco",
  exportSettings: "Esporta impostazioni",
  importSettings: "Importa impostazioni…",
  resetComponent: "Ripristina componente",
  saved: "Salvato",
  saving: "Salvataggio…",
  syncing: "Sincronizzazione…",
  savedLocal: "Salvato — solo in questo browser",
  localNote: "Il tuo lavoro è salvato solo in questo browser: cancellare i dati del browser lo eliminerebbe. Accedi (gratis) e si sincronizza con il tuo account.",
  account: "Account",
  backHome: "Torna alla home",
  exportAndSettings: "Esportazione e impostazioni",
};

const DE: Table = {
  export: "Exportieren",
  exportSvg: "Als SVG exportieren",
  exportPng: "Als PNG exportieren",
  downloadHtml: "HTML herunterladen",
  copySvg: "SVG-Code kopieren",
  exportGameKit: "Game-Kit exportieren",
  exportSettings: "Einstellungen exportieren",
  importSettings: "Einstellungen importieren…",
  resetComponent: "Komponente zurücksetzen",
  saved: "Gespeichert",
  saving: "Speichern…",
  syncing: "Synchronisieren…",
  savedLocal: "Gespeichert — nur in diesem Browser",
  localNote: "Deine Arbeit ist nur in diesem Browser gespeichert — das Löschen der Browserdaten würde sie entfernen. Melde dich (kostenlos) an, dann wird sie mit deinem Konto synchronisiert.",
  account: "Konto",
  backHome: "Zurück zur Startseite",
  exportAndSettings: "Export und Einstellungen",
};

const JA: Table = {
  export: "書き出し",
  exportSvg: "SVG を書き出す",
  exportPng: "PNG を書き出す",
  downloadHtml: "HTML をダウンロード",
  copySvg: "SVG コードをコピー",
  exportGameKit: "ゲームキットを書き出す",
  exportSettings: "設定を書き出す",
  importSettings: "設定を読み込む…",
  resetComponent: "コンポーネントをリセット",
  saved: "保存済み",
  saving: "保存中…",
  syncing: "同期中…",
  savedLocal: "保存済み — このブラウザのみ",
  localNote: "作品はこのブラウザにのみ保存されています。ブラウザのデータを消去すると失われます。サインイン（無料）するとアカウントに同期されます。",
  account: "アカウント",
  backHome: "ホームに戻る",
  exportAndSettings: "書き出しと設定",
};

const TABLES: Record<Locale, Table> = { en: EN, zh: ZH, fr: FR, es: ES, it: IT, de: DE, ja: JA };

const active = TABLES[currentLocale()];

/** Translate a key. English is the always-complete fallback — an untranslated
    key speaks English rather than breaking. */
export function t(key: keyof typeof EN): string {
  return active[key] ?? EN[key] ?? key;
}
