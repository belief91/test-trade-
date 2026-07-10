// app/cot/page.js
// Cette page définit ce que l'utilisateur voit sur tonsite.com/cot

import CotTffTable from "../../components/CotTffTable";

export default function PageCot() {
  return (
    <div style={{ padding: 24 }}>
      <CotTffTable />
    </div>
  );
}
