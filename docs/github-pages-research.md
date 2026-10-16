# Ricerca: GitHub Pages per Povo_Mappa (repository privato)

Fonti: documentazione ufficiale GitHub (docs.github.com) e verifica locale del repository.

## Contesto locale (verificato)

- Il repository `campagc/Povo_Mappa` è **privato** e appartenente a un **account personale** (non organizzazione).
- GitHub Pages **non è attualmente configurato** (`has_pages=false`).
- L'API autenticata non restituisce il campo `plan`, quindi **il piano dell'account non è determinabile**: valore nullo ≠ GitHub Free.

## 1. Piano richiesto per pubblicare da un repository privato

- Con **GitHub Free** (account personale **e** organizzazioni) il repository deve essere **pubblico**: non è possibile abilitare Pages su un repo privato.
  - Fonte: https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site — "If the account that owns the repository uses GitHub Free or GitHub Free for organizations, the repository must be public."
  - Fonte: https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages
- Per pubblicare Pages da un repository **privato** serve:
  - **Account personale**: **GitHub Pro** (o superiore).
  - **Organizzazione**: **GitHub Team** o **GitHub Enterprise Cloud**.
- La pubblicazione **privata** del sito (accesso limitato a chi ha accesso al repo) esiste solo per organizzazioni con **GitHub Enterprise Cloud**; non rilevante per un account personale.
  - Fonte: https://docs.github.com/en/pages/getting-started-with-github-pages/changing-the-visibility-of-your-github-pages-site

## 2. Sito pubblico anche se il sorgente è privato

- Il sito pubblicato è **pubblicamente accessibile su internet anche se il repository è privato**. GitHub avvisa di rimuovere eventuali dati sensibili prima della pubblicazione.
  - Fonte: https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site — "GitHub Pages sites are publicly available on the internet, even if the repository for the site is private."

## 3. Limitazione: hosting solo statico (niente backend Node)

- GitHub Pages è un servizio di **hosting di siti statici**: serve file HTML, CSS e JavaScript, opzionalmente passati attraverso un processo di build. **Non esegue codice server-side**: nessun backend Node.js né logica dinamica lato server.
  - Fonte: https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages — "GitHub Pages is a static site hosting service that takes HTML, CSS, and JavaScript files straight from a repository."

## 4. Impatto su questa app

- `public/app.js:67` effettua `fetch('/api/rooms')`, implementato in `server.js:133-139`, che a sua volta interroga EasyAcademy (`server.js:52-84`).
- Su GitHub Pages non esiste alcun server Node: la chiamata a `/api/rooms` fallirebbe e i **dati di disponibilità delle aule non funzionerebbero**.
- Servirebbe quindi un **backend separato** per l'API (o un adattamento dell'app, es. dati pre-generati o chiamata diretta a un servizio esterno).

## Conclusione

GitHub **consente** di pubblicare un sito Pages da un repository privato con **GitHub Pro** su account personale, e il sito risultante sarebbe **pubblico**. Tuttavia questa app **non può essere deployata invariata su GitHub Pages da solo**: essendo Pages solo hosting statico, il backend Node (`server.js`) che serve `/api/rooms` non può girarvi. Per usare Pages occorre un backend separato o una modifica dell'app.

Nessuna modifica remota o deployment effettuato.
