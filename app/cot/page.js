// app/cot/page.js
// FIX : ajout du bouton IASyntheseButton, qui existait déjà comme
// composant réutilisable mais n'était importé nulle part.

import CotTffTable from "../../components/CotTffTable";
import IASyntheseButton from "../../components/IASyntheseButton";

export default function PageCot() {
  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "flex-end" }}>
        <IASyntheseButton moduleLabel="COT" endpoint="/api/cot/analyse" method="POST" />
      </div>
      <CotTffTable />
    </div>
  );
}
