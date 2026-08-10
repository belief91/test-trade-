// app/courbe-de-taux/page.js
// FIX : ajout du bouton IASyntheseButton.
//
// HYPOTHÈSE NON CONFIRMÉE : endpoint pris par analogie avec /api/cot/analyse
// et la présence de /api/bond-yields/synthesis dans les logs de build.
// Le fichier de cette route n'a pas été fourni — à vérifier avant de
// déployer que c'est bien le bon endpoint (et pas /api/bond-yields/analysis).

import CourbeDeTauxTable from "../../components/CourbeDeTauxTable";
import IASyntheseButton from "../../components/IASyntheseButton";

export default function CourbeDeTauxPage() {
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "flex-end" }}>
        <IASyntheseButton moduleLabel="Courbe de taux" endpoint="/api/bond-yields/synthesis" method="POST" />
      </div>
      <CourbeDeTauxTable />
    </div>
  );
}
