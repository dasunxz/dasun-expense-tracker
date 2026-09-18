# Dasun Expense Tracker

A static personal finance dashboard built from the supplied Excel expense tracker.

## Included

- Dashboard with income, expenses, net cash flow, card outstanding and gold pawn balance
- Transaction manager with search, date filtering, type filtering, category filtering, editing and deletion
- Account balances with transfer handling
- Credit card outstanding, limits, available credit and utilisation
- Gold pawn / debt tracking
- Monthly and category analytics with charts
- JSON backup and restore
- CSV export
- Browser persistence using `localStorage`
- GitHub Pages ready with no build step

## Important storage note

The default version stores your data in the browser using `localStorage`. This means your data persists on the same browser and device but is not automatically shared between devices.

The project includes `config.example.js` as a placeholder for a future Supabase version if you want secure account login and cross-device sync.

## Files

- `index.html` — page structure and CDN chart dependency
- `styles.css` — responsive UI
- `app.js` — application logic and calculations
- `data.js` — imported seed data from the Excel workbook
- `config.example.js` — optional future Supabase configuration placeholder

## GitHub Pages setup

1. Create a new GitHub repository, for example `dasun-expense-tracker`.
2. Upload all files from this folder to the repository root.
3. Open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select the `main` branch and the `/root` folder then save.
6. Wait for GitHub Pages to publish the site.
7. Open the generated GitHub Pages URL.

## Data backup

Use **Settings → Export JSON Backup** regularly. The exported JSON file contains the complete current app state.

Use **Import JSON Backup** to restore that state in another browser.

## Spreadsheet rules reproduced

- Account balance = opening balance + income − expenses − transfers out + transfers in
- Credit card outstanding = opening outstanding + card spending − card payments
- Total net cash flow = total income − total expenses
- Credit card utilisation = current outstanding ÷ credit limit
- Gold pawn estimated monthly interest = principal × monthly interest rate
- Initial principal reduction = planned monthly payment − estimated monthly interest
