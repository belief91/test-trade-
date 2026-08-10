import CourbeDeTauxTable from "../../components/CourbeDeTauxTable";
import IASyntheseButton from "../../components/IASyntheseButton";

export default function CourbeDeTauxPage() {
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div style={{ marginBottom: 16 }}>
        <IASyntheseButton 
          moduleLabel="Courbe de Taux" 
          endpoint="/api/bond-yields/analysis" 
          method="GET" 
        />
      </div>
      <CourbeDeTauxTable />
    </div>
  );
}
