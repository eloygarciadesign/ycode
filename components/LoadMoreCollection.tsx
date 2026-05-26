'use client';

/**
 * LoadMoreCollection Component
 *
 * Client component that handles "Load More" pagination for collection layers.
 * Hydrates from SSR with initial items and fetches more on button click.
 * 
 * Features:
 * - Initial items rendered via SSR
 * - "Load More" button appends pre-rendered items without page reload
 * - Loading spinner during fetch (same style as PaginatedCollection)
 * - Automatic button hide when all items loaded
 * - Works with multi-reference fields (itemIds filtering)
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { ITEMS_INJECTED_EVENT, type ItemsInjectedDetail } from '@/components/FilterableCollection';
import type { CollectionPaginationMeta, CollectionItem, Layer } from '@/types';

interface LoadMoreCollectionProps {
  children: React.ReactNode;
  paginationMeta: CollectionPaginationMeta;
  collectionLayerId: string;
  /** Layer template used to render new items (from _paginationMeta.layerTemplate) */
  layerTemplate?: Layer[];
  /** Optional: item IDs for multi-reference filtering */
  itemIds?: string[];
  /** Preview mode forces server-rendered links to use the `/ycode/preview` prefix. */
  isPreview?: boolean;
  /** Item ID of the dynamic-page collection being rendered (for `current-page` link keywords). */
  pageCollectionItemId?: string;
  /** Ordered ids of the dynamic page's collection — powers `next-item` / `previous-item` link keywords. */
  pageCollectionSortedItemIds?: string[];
  /** Full collection layer (sans children) — lets the server rebuild proper item wrappers (link/action/attributes). */
  collectionLayer?: Omit<Layer, 'children'>;
}

interface LoadMoreState {
  loadedCount: number;
  isLoading: boolean;
  hasMore: boolean;
}

export default function LoadMoreCollection({
  children,
  paginationMeta,
  collectionLayerId,
  layerTemplate,
  itemIds,
  isPreview = false,
  pageCollectionItemId,
  pageCollectionSortedItemIds,
  collectionLayer,
}: LoadMoreCollectionProps) {
  const { totalItems, itemsPerPage, collectionId } = paginationMeta;
  const containerRef = useRef<HTMLDivElement>(null);
  const itemsContainerRef = useRef<HTMLDivElement>(null);
  
  const [state, setState] = useState<LoadMoreState>({
    loadedCount: itemsPerPage,
    isLoading: false,
    hasMore: itemsPerPage < totalItems,
  });

  // Fetch more items with pre-rendered HTML
  const loadMore = useCallback(async () => {
    if (state.isLoading || !state.hasMore) return;
    
    // Need layerTemplate to render items
    if (!layerTemplate || layerTemplate.length === 0) {
      console.error('LoadMoreCollection: layerTemplate is required for rendering');
      return;
    }
    
    setState(prev => ({ ...prev, isLoading: true }));
    
    try {
      // POST request with template for server-side rendering
      const response = await fetch(
        `/ycode/api/collections/${collectionId}/items/load-more`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            offset: state.loadedCount,
            limit: itemsPerPage,
            published: true,
            itemIds: itemIds,
            layerTemplate: layerTemplate,
            collectionLayerId: collectionLayerId,
            isPreview,
            pageCollectionItemId,
            pageCollectionSortedItemIds,
            collectionLayer,
          }),
        }
      );
      
      if (!response.ok) {
        throw new Error('Failed to load more items');
      }
      
      const result = await response.json();
      const { items, html, hasMore } = result.data;
      const newItemIds: string[] = Array.isArray(items)
        ? (items as CollectionItem[]).map(item => item.id)
        : [];

      // Append rendered HTML to the items container
      if (html && itemsContainerRef.current) {
        itemsContainerRef.current.insertAdjacentHTML('beforeend', html);
        if (layerTemplate && newItemIds.length > 0) {
          const detail: ItemsInjectedDetail = {
            collectionLayerId,
            layerTemplate,
            itemIds: newItemIds,
            append: true,
            collectionLayer,
          };
          window.dispatchEvent(new CustomEvent<ItemsInjectedDetail>(ITEMS_INJECTED_EVENT, { detail }));
        }
      }
      
      setState(prev => ({
        loadedCount: prev.loadedCount + items.length,
        isLoading: false,
        hasMore,
      }));
    } catch (error) {
      console.error('Load more failed:', error);
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, [state.loadedCount, state.isLoading, state.hasMore, itemsPerPage, collectionId, collectionLayerId, itemIds, layerTemplate, isPreview, pageCollectionItemId, pageCollectionSortedItemIds, collectionLayer]);

  // Handle click events on load more button (delegated)
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const button = target.closest('[data-pagination-action="load_more"]') as HTMLElement;
      
      if (!button) return;
      
      const layerId = button.getAttribute('data-collection-layer-id');
      
      // Only handle clicks for this collection
      if (layerId !== collectionLayerId) return;
      
      e.preventDefault();
      loadMore();
    };
    
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [collectionLayerId, loadMore]);

  // Update the count display and button visibility when state changes
  useEffect(() => {
    // Update count display - use data-layer-id attribute (not id)
    // The count element has ID format: ${collectionLayerId}-pagination-count
    const countElement = document.querySelector(
      `[data-pagination-for="${collectionLayerId}"] [data-layer-id$="-pagination-count"]`
    );
    if (countElement) {
      countElement.textContent = `Showing ${state.loadedCount} of ${totalItems}`;
    }
    
    // Hide load more button when all items are loaded
    const loadMoreButton = document.querySelector(
      `[data-pagination-for="${collectionLayerId}"] [data-pagination-action="load_more"]`
    ) as HTMLElement;
    if (loadMoreButton) {
      loadMoreButton.style.display = state.hasMore ? '' : 'none';
    }
  }, [state.loadedCount, state.hasMore, totalItems, collectionLayerId]);

  return (
    <div 
      ref={containerRef}
      className={`relative ${state.isLoading ? 'opacity-50 pointer-events-none' : ''}`}
      data-loadmore-collection={collectionLayerId}
    >
      {/* Loading overlay - same style as PaginatedCollection */}
      {state.isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/50 z-10">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
        </div>
      )}
      
      {/* Collection content container - SSR items + dynamically appended items */}
      <div ref={itemsContainerRef}>
        {children}
      </div>
    </div>
  );
}
