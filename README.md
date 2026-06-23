# AOGJ's to-do

En privat, fælles huslig to-do-app — bygget til at løse tre ting Excel ikke kan:
**parret prioritering**, **forskellige tidsestimater**, og **retfærdig fordeling**.

## Idé

- Hver person giver en opgave en **prioritet 0–5** (0 = ikke en fælles opgave, 5 = højest) og sit
  eget **tidsestimat**. En opgave er først "fælles" når **begge** har vurderet.
- **⚡ Score** = gns. prioritet ÷ gns. tid → rækkefølgen i puljen (vigtigt + hurtigt øverst).
- **🏅 Point** = gns. prioritet × gns. tid → belønning når opgaven udføres; samles i en stilling pr. person.
- Opgaver **tildeles** og vises statisk under **Fordeling** (Planlagt + Udført), så de kan deles
  til ~lige mange point.
- Foto/video kan lægges på opgaver løbende (også via kamera på mobil).

## Stak

- **Backend:** PHP + SQLite (`site/api/*.php`), database i `site/storage/` (ikke i git).
- **Frontend:** vanilla HTML/CSS/JS (`site/`), mørkt tema, mobilvenligt.
- **Deploy:** `python3 deploy.py` (FTP). Host, bruger og adgangskode læses fra en lokal
  `.ftp-credentials` (ikke i git) — se ingen hemmeligheder eller adresser i dette repo.

## Kør lokalt

```
php -S localhost:8000 -t site
```
(kræver `pdo_sqlite`).
