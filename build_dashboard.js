const fs = require('fs');
const path = require('path');

const srcFile = path.join(__dirname, 'src', 'dashboardProvider.ts');
const cssFile = path.join(__dirname, 'scratch', 'new_css.txt');
const htmlFile = path.join(__dirname, 'scratch', 'new_html.txt');
const jsFile = path.join(__dirname, 'scratch', 'new_js.txt');

const original = fs.readFileSync(srcFile, 'utf8');
const cssRaw = fs.readFileSync(cssFile, 'utf8');
const htmlRaw = fs.readFileSync(htmlFile, 'utf8');
const jsRaw = fs.readFileSync(jsFile, 'utf8');

const methodStart = original.indexOf("    private _getHtmlForWebview(");
if (methodStart === -1) { console.error("Could not find _getHtmlForWebview"); process.exit(1); }

const header = original.substring(0, methodStart);

function esc(s) {
    return s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

const cssEsc = esc(cssRaw);
const htmlEsc = esc(htmlRaw);
const jsStr = JSON.stringify(jsRaw);

const newMethod = `    private _getHtmlForWebview(accountsData: any[], groupsConfig: any, uiState: any = {}) {
        const accountsJson = JSON.stringify(accountsData);
        const groupsJson = JSON.stringify(groupsConfig);
        const translationsJson = JSON.stringify(getTranslations());
        const uiStateJson = JSON.stringify(uiState);

        const jsTemplate = ${jsStr};
        const jsCode = jsTemplate
            .replace('TRANSLATIONS_PLACEHOLDER', translationsJson)
            .replace('ACCOUNTS_PLACEHOLDER', accountsJson)
            .replace('GROUPS_PLACEHOLDER', groupsJson);

        return \`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Anbutech Mission Control</title>
<style>
${cssEsc}
</style>
</head>
<body>
${htmlEsc}
<script>\${jsCode}</script>
</body>
</html>\`;
    }
}
`;

const result = header + newMethod;
fs.writeFileSync(srcFile, result, 'utf8');
console.log('OK! Dashboard rebuilt:', result.length, 'bytes');
