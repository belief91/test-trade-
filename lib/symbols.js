export const SYMBOLES = {
  "Forex — Majeures": ["EUR/USD", "GBP/USD", "USD/JPY", "USD/CHF", "USD/CAD", "AUD/USD", "NZD/USD"],
  "Forex — Croisées": [
    "EUR/GBP", "EUR/JPY", "EUR/CHF", "EUR/AUD", "EUR/CAD", "EUR/NZD",
    "GBP/JPY", "GBP/CHF", "GBP/AUD", "GBP/CAD", "GBP/NZD",
    "AUD/JPY", "AUD/CHF", "AUD/CAD", "AUD/NZD",
    "NZD/JPY", "CAD/JPY", "CHF/JPY",
  ],
  "Indices": ["US30 (Dow Jones)", "SP500", "NASDAQ100", "GER40 (DAX)", "UK100 (FTSE)", "JPN225 (Nikkei)", "FRA40 (CAC)", "AUS200"],
  "Matières premières": ["XAUUSD (Or)", "XAGUSD (Argent)", "WTI (Pétrole brut US)", "BRENT (Pétrole brut)", "NATGAS (Gaz naturel)"],
  "Obligations": ["US10Y (Bon du Trésor US 10 ans)", "BUND (Obligation allemande)", "UK GILT"],
};

export const SYMBOLES_FLAT = Object.values(SYMBOLES).flat();
