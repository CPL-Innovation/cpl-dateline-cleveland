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
import { StacksBrowse } from './StacksBrowse';
import { IssueReader, type ReaderView } from './IssueReader';
import { deriveShelf, fetchShelf, type Shelf } from '../lib/shelf';
import { mockShelf } from '../data/mockShelf';

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
  // THE STACKS: the shelf is SHAPE (issues + their pages), fetched separately
  // from /api/shelf; page CONTENT comes from the dataset above.
  const [liveShelf, setLiveShelf] = useState<Shelf | null>(null);
  const [openIssue, setOpenIssue] = useState<string | null>(null);
  const [readerPage, setReaderPage] = useState(1);
  const [readerView, setReaderView] = useState<ReaderView>('read');
  const [serial, setSerial] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== 'real') return;
    const API = 'http://' + location.hostname + ':5170';
    let cancelled = false;
    fetch(API + '/api/discovery')
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then((payload) => { if (!cancelled) setLiveReal(buildRealDataset(payload).dataset); })
      .catch(() => { if (!cancelled) setLiveReal(null); }); // fall back to committed
    fetchShelf()
      .then((s) => { if (!cancelled) setLiveShelf(s); })
      .catch(() => { if (!cancelled) setLiveShelf(null); }); // fall back to derived
    return () => { cancelled = true; };
  }, [mode]);

  const dataset = mode === 'mock' ? mockDataset : (liveReal ?? realDataset);
  const shelf = mode === 'mock' ? mockShelf : (liveShelf ?? deriveShelf(dataset));
  const activeIssue = openIssue ? shelf.issues.find((i) => i.key === openIssue) ?? null : null;

  const goto = (p: Page) => {
    setPage(p);
    setSelectedId(null);
    setDetailId(null);
    if (p !== 'stacks') setOpenIssue(null);
  };

  const openIssueAt = (key: string) => {
    const iss = shelf.issues.find((i) => i.key === key);
    setOpenIssue(key);
    // Open on the first leaf that actually has something to read; failing that,
    // page one — the scan is still worth turning to.
    setReaderPage(iss?.pages.find((p) => p.publishedCount > 0)?.page ?? iss?.pages[0]?.page ?? 1);
    setReaderView('read');
    setDetailId(null);
    window.scrollTo({ top: 0 });
  };

  const switchMode = (m: DatasetMode) => {
    if (m === mode) return;
    setMode(m);
    // Reset every id/selection — mock and real use disjoint id spaces.
    setSelectedId(null);
    setDetailId(null);
    setSelected({});
    setOpenIssue(null);
    setSerial(null);
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

  // The detail view is shared by the index, by search results and by the reader —
  // the difference is only where "back" returns to.
  const activeItem = useMemo(() => {
    if (page === 'calendar' || !detailId) return null;
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

        {page === 'stacks' &&
          (activeItem ? (
            <IndexDetail
              item={activeItem}
              dataset={dataset}
              onBack={() => setDetailId(null)}
              backLabel={activeIssue ? 'BACK TO THE READER' : 'BACK TO THE STACKS'}
            />
          ) : activeIssue ? (
            <IssueReader
              issue={activeIssue}
              dataset={dataset}
              pageNumber={readerPage}
              view={readerView}
              onPage={setReaderPage}
              onView={setReaderView}
              onBack={() => setOpenIssue(null)}
              onOpenObject={(id) => { setDetailId(id); window.scrollTo({ top: 0 }); }}
            />
          ) : (
            <StacksBrowse
              shelf={shelf}
              dataset={dataset}
              serial={serial}
              onSerial={setSerial}
              onOpen={openIssueAt}
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
