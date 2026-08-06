import { useEffect, useMemo, useState } from 'react';
import type { CalendarEvent, Dataset, DatasetMode, Page } from '../lib/types';
import type { Selection } from '../lib/match';
import { mockDataset } from '../data/mock';
import { realDataset, buildRealDataset } from '../data/realAdapter';
import { Header } from './Header';
import { Footer } from './Footer';
import { CalendarBrowse } from './CalendarBrowse';
import { EventDetail } from './EventDetail';
import { IndexBrowse } from './IndexBrowse';
import { IndexDetail } from './IndexDetail';
import { SearchResults } from './SearchResults';

// The populated mock week (Jul 23–29 1970) sits at index 4.
const MOCK_POPULATED_WEEK = 4;

export function Discovery() {
  const [page, setPage] = useState<Page>('calendar');
  const [mode, setMode] = useState<DatasetMode>('mock');
  const [weekIdx, setWeekIdx] = useState(MOCK_POPULATED_WEEK);
  const [selectedId, setSelectedId] = useState<string | null>(null); // calendar event
  const [selected, setSelected] = useState<Selection>({}); // index facets
  const [detailId, setDetailId] = useState<string | null>(null); // index item
  const [query, setQuery] = useState('');           // live text in the header box
  const [committed, setCommitted] = useState('');   // the query actually being shown
  // SLICE-08: REAL mode reads LIVE from the Postgres store via the ingestion
  // service; falls back to the committed dataset if the service is offline.
  const [liveReal, setLiveReal] = useState<Dataset | null>(null);

  useEffect(() => {
    if (mode !== 'real') return;
    const API = 'http://' + location.hostname + ':5170';
    let cancelled = false;
    fetch(API + '/api/discovery')
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then((payload) => { if (!cancelled) setLiveReal(buildRealDataset(payload).dataset); })
      .catch(() => { if (!cancelled) setLiveReal(null); }); // fall back to committed
    return () => { cancelled = true; };
  }, [mode]);

  const dataset = mode === 'mock' ? mockDataset : (liveReal ?? realDataset);

  const goto = (p: Page) => {
    setPage(p);
    setSelectedId(null);
    setDetailId(null);
  };

  const switchMode = (m: DatasetMode) => {
    if (m === mode) return;
    setMode(m);
    // Reset every id/selection — mock and real use disjoint id spaces.
    setSelectedId(null);
    setDetailId(null);
    setSelected({});
    setWeekIdx(m === 'mock' ? MOCK_POPULATED_WEEK : 0);
    // A result list from the other dataset would be stale the moment the ids change.
    if (page === 'search') setPage('index');
    setQuery('');
    setCommitted('');
  };

  const runSearch = () => {
    const q = query.trim();
    if (q.length < 2) return;   // one character matches half the paper
    setCommitted(q);
    setDetailId(null);
    setSelectedId(null);
    setPage('search');
  };

  const activeEvent: CalendarEvent | null = useMemo(() => {
    if (page !== 'calendar' || !selectedId) return null;
    for (const sec of dataset.sections) {
      const ev = sec.events.find((e) => e.id === selectedId);
      if (ev) return ev;
    }
    return null;
  }, [page, selectedId, dataset]);

  // The detail view is shared by the index and by search results — the difference
  // is only where "back" returns to.
  const activeItem = useMemo(() => {
    if ((page !== 'index' && page !== 'search') || !detailId) return null;
    return dataset.indexItems.find((i) => i.id === detailId) ?? null;
  }, [page, detailId, dataset]);

  return (
    <div className="dc-app">
      <Header
        page={page}
        mode={mode}
        onNav={goto}
        onMode={switchMode}
        query={query}
        onQuery={setQuery}
        onSearch={runSearch}
      />

      <div style={{ flex: 1 }}>
        {page === 'calendar' &&
          (activeEvent ? (
            <EventDetail event={activeEvent} onBack={() => setSelectedId(null)} />
          ) : (
            <CalendarBrowse
              dataset={dataset}
              weekIdx={weekIdx}
              onPickWeek={(i) => {
                setWeekIdx(i);
                setSelectedId(null);
              }}
              onOpenEvent={setSelectedId}
              onBackToPopulated={() => setWeekIdx(MOCK_POPULATED_WEEK)}
            />
          ))}

        {page === 'index' &&
          (activeItem ? (
            <IndexDetail item={activeItem} dataset={dataset} onBack={() => setDetailId(null)} />
          ) : (
            <IndexBrowse
              dataset={dataset}
              selected={selected}
              onToggle={(id) => setSelected((s) => ({ ...s, [id]: !s[id] }))}
              onClearAll={() => setSelected({})}
              onOpen={setDetailId}
            />
          ))}

        {page === 'search' &&
          (activeItem ? (
            <IndexDetail
              item={activeItem}
              dataset={dataset}
              onBack={() => setDetailId(null)}
              backLabel="BACK TO SEARCH RESULTS"
            />
          ) : (
            <SearchResults
              dataset={dataset}
              query={committed}
              onOpen={setDetailId}
              onClear={() => {
                setQuery('');
                setCommitted('');
                goto('index');
              }}
            />
          ))}
      </div>

      <Footer />
    </div>
  );
}
