// app/cot/page.js
// Cette page définit ce que l'utilisateur voit sur tonsite.com/cot

import CotTffTable from "../../components/CotTffTable";
import IASyntheseButton from "../../components/IASyntheseButton";

export default function PageCot() {
  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 16 }}>
        <IASyntheseButton 
          moduleLabel="COT" 
          endpoint="/api/cot/analyse" 
          method="POST" 
        />
      </div>
      <CotTffTable />
    </div>
  );
}
