import './App.css';

function App() {
  return (
    <main className="app-shell">
      <h1 className="app-title">Todos</h1>
      <div className="app-slot" data-slot="input" />
      <div className="app-slot" data-slot="state" />
      <div className="app-slot" data-slot="list" />
      <div className="app-slot" data-slot="erase" />
    </main>
  );
}

export default App;
