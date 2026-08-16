export default function Home() {
  return (
    <div>
      <h1>Rent-a-Car Manager</h1>
      <p className="muted">Owner dashboard.</p>
      <ul style={{ marginTop: "1rem", paddingLeft: "1.2rem" }}>
        <li>
          <a href="/vehicles">Vozila</a> — CRUD flote, upload prometne i slika
        </li>
        <li>
          <a href="/clients">Klijenti</a> — evidencija najmoprimaca
        </li>
        <li>
          <a href="/contracts">Ugovori</a> — kreiranje ugovora i slanje na potpis
        </li>
      </ul>
    </div>
  );
}
