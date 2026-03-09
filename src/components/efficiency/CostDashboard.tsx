import { useState, useEffect } from 'react'
import {
  X, BarChart3, RefreshCw, Loader2,
  Database, TrendingUp, Trash2, Zap
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from '../ui/Button'
import { useCostStore } from '../../stores/costStore'

interface CostDashboardProps {
  open: boolean
  onClose: () => void
  projectId: string | null
}

export function CostDashboard({ open, onClose, projectId }: CostDashboardProps) {
  const { costStats, dailyCosts, cacheStats, loading, loadCostStats, loadDailyCosts, loadCacheStats, invalidateCache } = useCostStore()
  const [refreshing, setRefreshing] = useState(false)
  const [invalidating, setInvalidating] = useState(false)

  useEffect(() => {
    if (!open || !projectId) return
    loadCostStats(projectId)
    loadDailyCosts(projectId, 7)
    loadCacheStats()
  }, [open, projectId, loadCostStats, loadDailyCosts, loadCacheStats])

  const handleRefresh = async () => {
    if (!projectId) return
    setRefreshing(true)
    await Promise.all([loadCostStats(projectId), loadDailyCosts(projectId, 7), loadCacheStats()])
    setRefreshing(false)
  }

  const handleInvalidateCache = async () => {
    setInvalidating(true)
    await invalidateCache()
    setInvalidating(false)
  }

  if (!open) return null

  const formatTokens = (tokens: number) => tokens >= 1000000 ? `${(tokens / 1000000).toFixed(1)}M` : tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}K` : String(tokens)

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className={cn(
        'relative ml-auto w-[560px] h-full bg-[var(--bg-primary)]',
        'border-l border-[var(--border-primary)]',
        'flex flex-col overflow-hidden',
        'animate-in slide-in-from-right duration-300'
      )}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-primary)]">
          <div className="flex items-center gap-2.5">
            <BarChart3 size={20} className="text-[var(--accent-primary)]" />
            <h2 className="text-[16px] font-semibold text-[var(--text-primary)]">Token Usage</h2>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={handleRefresh} disabled={refreshing}>
              {refreshing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X size={16} />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-[var(--text-tertiary)]" />
            </div>
          ) : (
            <>
              {costStats && (
                <div className="space-y-3">
                  <div className="bg-[var(--bg-secondary)] rounded-xl p-4 col-span-2">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp size={14} className="text-[var(--accent-primary)]" />
                      <span className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider">Tổng tokens</span>
                    </div>
                    <p className="text-[28px] font-bold text-[var(--text-primary)]">
                      {formatTokens(costStats.totalInputTokens + costStats.totalOutputTokens)}
                    </p>
                    <div className="flex items-center gap-4 mt-1">
                      <span className="text-[12px] text-[var(--text-tertiary)]">
                        Input: <span className="text-[var(--text-secondary)] font-medium">{formatTokens(costStats.totalInputTokens)}</span>
                      </span>
                      <span className="text-[12px] text-[var(--text-tertiary)]">
                        Output: <span className="text-[var(--text-secondary)] font-medium">{formatTokens(costStats.totalOutputTokens)}</span>
                      </span>
                      <span className="text-[12px] text-[var(--text-tertiary)]">
                        {costStats.queryCount} truy vấn
                      </span>
                    </div>
                  </div>

                  <div className="bg-[var(--bg-secondary)] rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Zap size={14} className="text-[var(--accent-primary)]" />
                      <span className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider">Tiết kiệm từ Cache</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <p className="text-[15px] font-semibold text-[var(--text-primary)]">
                        {formatTokens(costStats.totalCachedTokens)} tokens
                      </p>
                      {costStats.totalInputTokens > 0 && (
                        <span className="text-[12px] text-green-600">
                          {((costStats.totalCachedTokens / (costStats.totalInputTokens + costStats.totalCachedTokens)) * 100).toFixed(1)}% cache hit
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {dailyCosts.length > 0 && (
                <div className="border border-[var(--border-primary)] rounded-xl p-4">
                  <h3 className="text-[13px] font-semibold text-[var(--text-primary)] mb-3">Token usage 7 ngày qua</h3>
                  <div className="space-y-1.5">
                    {dailyCosts.map((day) => {
                      const maxQueries = Math.max(...dailyCosts.map(d => d.queries), 1)
                      return (
                        <div key={day.date} className="flex items-center gap-3">
                          <span className="text-[12px] text-[var(--text-tertiary)] w-20">{day.date}</span>
                          <div className="flex-1 bg-[var(--bg-secondary)] rounded-full h-2 overflow-hidden">
                            <div
                              className="h-full bg-[var(--accent-primary)] rounded-full transition-all"
                              style={{ width: `${(day.queries / maxQueries) * 100}%` }}
                            />
                          </div>
                          <span className="text-[12px] text-[var(--text-secondary)] w-16 text-right">
                            {day.queries} truy vấn
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {cacheStats && (
                <div className="border border-[var(--border-primary)] rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Database size={14} className="text-[var(--accent-primary)]" />
                      <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">Semantic Cache</h3>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleInvalidateCache}
                      disabled={invalidating}
                    >
                      {invalidating ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                      <span className="ml-1">Xóa cache</span>
                    </Button>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-[var(--bg-secondary)] rounded-lg p-2.5 text-center">
                      <p className="text-[15px] font-semibold text-[var(--text-primary)]">{cacheStats.totalEntries}</p>
                      <p className="text-[10px] text-[var(--text-tertiary)]">mục</p>
                    </div>
                    <div className="bg-[var(--bg-secondary)] rounded-lg p-2.5 text-center">
                      <p className="text-[15px] font-semibold text-[var(--text-primary)]">{cacheStats.totalHits}</p>
                      <p className="text-[10px] text-[var(--text-tertiary)]">cache hit</p>
                    </div>
                    <div className="bg-[var(--bg-secondary)] rounded-lg p-2.5 text-center">
                      <p className="text-[15px] font-semibold text-[var(--text-primary)]">{formatTokens(cacheStats.totalTokensSaved)}</p>
                      <p className="text-[10px] text-[var(--text-tertiary)]">tokens tiết kiệm</p>
                    </div>
                  </div>
                </div>
              )}

              {!costStats && (
                <div className="text-center py-12">
                  <BarChart3 size={32} className="text-[var(--text-tertiary)] mx-auto mb-3 opacity-40" />
                  <p className="text-[13px] text-[var(--text-tertiary)]">Chưa có dữ liệu token usage</p>
                  <p className="text-[12px] text-[var(--text-tertiary)] mt-1">Bắt đầu sử dụng để theo dõi</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
