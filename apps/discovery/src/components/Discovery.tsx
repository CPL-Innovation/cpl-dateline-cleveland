import { useMemo, useState } from 'react';
import type { CalendarEvent, DatasetMode, Page } from '../lib/types';
import type { Selection } from '../lib/match';
import { mockDataset } from '../data/mock';
import { realDataset } from '../data/realAdapter';
import { Header } from './Header';
import { Footer } from './Footer';
import { CalendarBrowse } from './CalendarBrowse';
import { EventDetail } from './EventDetail';
import { IndexBrowse } from './IndexBrowse';
import { IndexDetail } from './IndexDetail';

// The populated mock week (Jul 23–29 1970) sits at index 4.
const MOCK_POPULATED_WEEK = 4;

export function Discovery() {
  const [page, setPage] = useState<Page>('calendar');
  const [mode, setMode] = useState<DatasetMode>('mock');
  const [weekIdx, setWeekIdx] = useState(MOCK_POPULATED_WEEK);
  const [selectedId, setSelectedId] = useState<string | null>(null); // calendar event
  const [selected, setSelected] = useState<Selection>({}); // index facets
  const [detailId, setDetailId] = useState<string | null>(null); // index item

  const dataset = mode === 'mock' ? mockDataset : realDataset;

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
  };

  const activeEvent: CalendarEvent | null = useMemo(() => {
    if (page !== 'calendar' || !selectedId) return null;
    for (const sec of dataset.sections) {
      const ev = sec.events.find((e) => e.id === selectedId);
      if (ev) return ev;
    }
    return null;
  }, [page, selectedId, dataset]);

  const activeItem = useMemo(() => {
    if (page !== 'index' || !detailId) return null;
    return dataset.indexItems.find((i) => i.id === detailId) ?? null;
  }, [page, detailId, dataset]);

  return (
    <div className="dc-app">
      <Header page={page} mode={mode} onNav={goto} onMode={switchMode} />

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
      </div>

      <Footer />
    </div>
  );
}
