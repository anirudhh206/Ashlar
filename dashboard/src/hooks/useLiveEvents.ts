import { useEffect, useRef } from 'react';
import { RELAY_URL, type RelaySseEvent } from '../types.js';

/**
 * Subscribes to the relay's global SSE feed (GET /events with no ?workflow= param) — every real
 * attestation and agent event across the whole program, including the ones a real Approve/Reject
 * on the Approvals or Overview page produces. Used to make lists (Workflows, Approvals, the
 * sidebar's pending-approval count) refresh the instant something real happens elsewhere in the
 * app, instead of only on next page load or a slow poll.
 *
 * Debounced slightly: a single real action (e.g. a full deploy) can produce 4-5 attestation
 * events within a couple of seconds, and refetching a full list on every one of them would be
 * wasteful — one refresh shortly after the burst settles is what a human actually wants to see.
 */
export function useLiveEvents(onEvent: (event: RelaySseEvent) => void, debounceMs = 400): void {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    const source = new EventSource(`${RELAY_URL}/events`);
    let timer: ReturnType<typeof setTimeout> | null = null;

    source.onmessage = (msg) => {
      const event = JSON.parse(msg.data) as RelaySseEvent;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => onEventRef.current(event), debounceMs);
    };

    return () => {
      if (timer) clearTimeout(timer);
      source.close();
    };
  }, [debounceMs]);
}
