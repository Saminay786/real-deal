import { render } from 'preact';
import { FixtureSaver } from './FixtureSaver';

function App() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '12px' }}>
      <h1 style={{ fontSize: '16px', margin: 0 }}>Real Deal</h1>
      <p>Open an amazon.in product or review page.</p>
      {import.meta.env.MODE === 'fixtures' && <FixtureSaver />}
    </main>
  );
}

const root = document.getElementById('app');
if (root) render(<App />, root);
