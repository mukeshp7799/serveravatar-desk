/**
 * Test Cases API hooks.
 *
 * - `useProjectTestCases(projectId)` holds the suite list + paginated test case list,
 *   plus mutations for suites and test cases. Designed to power the main
 *   `/projects/[id]/test-cases` page (sidebar + table).
 * - `useTestCaseDetail(caseId)` lazily loads the full test case (with steps,
 *   comments, attachments) for the slide-in detail panel.
 *
 * Mirrors the patterns from `task-board-api.ts` and `todos-api.ts`:
 *   - Single hook for the list page keeps the sidebar + table in sync.
 *   - Detail hook fetches on demand; mutations patch local state.
 */

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'
import type { Reaction } from '@/types/project'

/* ─── Types ─────────────────────────────────────────────────────── */
export type TestPriority = 'low' | 'medium' | 'high' | 'critical'
export type TestStatus = 'draft' | 'ready' | 'in_progress' | 'passed' | 'failed' | 'skipped'

export interface SuiteUser {
  id: number | string
  name: string
  initials: string
  email?: string
  avatar?: string | null
}

export type ExecutionStatus = 'pending' | 'passed' | 'failed'

export interface TestAssignee {
  id: number | string
  user_id: number | string
  execution_status: ExecutionStatus
  name: string
  initials: string
  email?: string
  avatar?: string | null
}

export interface TestSuite {
  id: number | string
  project_id: number | string
  name: string
  description: string | null
  created_by: number | string
  created_at: string
  updated_at: string | null
  test_case_count: number
  creator: SuiteUser
}

export interface TestStep {
  id: number | string
  test_case_id: number | string
  step_number: number
  description: string
  expected_result: string | null
}

export interface TestComment {
  id: number | string
  test_case_id: number | string
  body: string
  created_at: string
  updated_at: string | null
  author: SuiteUser
  reactions?: Reaction[]
}

export interface TestAttachment {
  id: number | string
  test_case_id: number | string
  file_url: string
  file_type: string | null
  file_size: number | null
  uploaded_by: number | string
  created_at: string
  name: string
}

export interface TestCase {
  id: number | string
  project_id: number | string
  suite_id: number | string
  task_id: number | string | null
  task_title?: string | null
  title: string
  priority: TestPriority
  status: TestStatus
  assigned_tester_id: number | string | null
  assignees: TestAssignee[]      // multiple assignees with passed status
  preconditions: string | null
  expected_result: string | null
  actual_result: string | null
  created_by: number | string
  created_at: string
  updated_at: string | null
  author: SuiteUser | null
  tester: SuiteUser | null
  suite_name: string | null
  step_count?: number
  comment_count?: number
  attachment_count?: number
  passed_count?: number
  failed_count?: number
  pending_count?: number
  total_assignees?: number
  computed_status?: string | null
  effective_status?: string
  // only populated by detail hook
  steps?: TestStep[]
  comments?: TestComment[]
  attachments?: TestAttachment[]
}

export interface TestCaseListResponse {
  testCases: TestCase[]
  total: number
  page: number
  per_page: number
}

/* ─── Main hook ────────────────────────────────────────────────── */
export interface ProjectTestCaseFilters {
  search?: string
  suite_id?: number | string | null
  status?: TestStatus | null
  priority?: TestPriority | null
  assigned_to_me?: boolean
  page?: number
  per_page?: number
}

export function useProjectTestCases(projectId: string | number) {
  const [suites, setSuites] = useState<TestSuite[]>([])
  const [testCases, setTestCases] = useState<TestCase[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(15)
  const [filters, setFilters] = useState<ProjectTestCaseFilters>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const alive = useRef(true)

  const fetchSuites = useCallback(async () => {
    if (!projectId) return
    try {
      const res = await api.get(`/projects/${projectId}/test-suites`)
      if (!alive.current) return
      setSuites(res.suites || [])
    } catch (e: any) {
      if (!alive.current) return
      setError(e?.message || 'Failed to load suites')
    }
  }, [projectId])

  const fetchTestCases = useCallback(async () => {
    if (!projectId) return
    try {
      const params: string[] = []
      if (filters.search) params.push(`search=${encodeURIComponent(filters.search)}`)
      if (filters.suite_id) params.push(`suite_id=${filters.suite_id}`)
      if (filters.status) params.push(`status=${filters.status}`)
      if (filters.priority) params.push(`priority=${filters.priority}`)
      if (filters.assigned_to_me) params.push(`assigned_to_me=true`)
      params.push(`page=${page}`)
      params.push(`per_page=${perPage}`)
      const qs = params.join('&')
      const res = await api.get(`/projects/${projectId}/test-cases?${qs}`)
      if (!alive.current) return
      setTestCases(res.testCases || [])
      setTotal(res.total || 0)
      setError(null)
    } catch (e: any) {
      if (!alive.current) return
      setError(e?.message || 'Failed to load test cases')
    }
  }, [projectId, filters, page, perPage])

  const refresh = useCallback(async () => {
    setLoading(true)
    await Promise.all([fetchSuites(), fetchTestCases()])
    if (alive.current) setLoading(false)
  }, [fetchSuites, fetchTestCases])

  useEffect(() => {
    alive.current = true
    refresh()
    return () => { alive.current = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  // Refetch test cases when filters or pagination change
  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    const run = async () => {
      try {
        const params: string[] = []
        if (filters.search) params.push(`search=${encodeURIComponent(filters.search)}`)
        if (filters.suite_id) params.push(`suite_id=${filters.suite_id}`)
        if (filters.status) params.push(`status=${filters.status}`)
        if (filters.priority) params.push(`priority=${filters.priority}`)
        if (filters.assigned_to_me) params.push(`assigned_to_me=true`)
        params.push(`page=${page}`)
        params.push(`per_page=${perPage}`)
        const res = await api.get(`/projects/${projectId}/test-cases?${params.join('&')}`)
        if (cancelled) return
        setTestCases(res.testCases || [])
        setTotal(res.total || 0)
        setError(null)
      } catch (e: any) {
        if (cancelled) return
        setError(e?.message || 'Failed to load test cases')
      }
    }
    run()
    return () => { cancelled = true }
  }, [projectId, filters, page, perPage])

  /* ── Suite mutations ────────────────────────────────────────── */
  const createSuite = useCallback(async (name: string, description?: string | null) => {
    const res = await api.post(`/projects/${projectId}/test-suites`, { name, description })
    if (res.suite) {
      setSuites((s) => [...s, res.suite])
    }
    return res.suite as TestSuite
  }, [projectId])

  const renameSuite = useCallback(async (suiteId: string | number, name: string, description?: string | null) => {
    const res = await api.put(`/projects/${projectId}/test-suites/${suiteId}`, { name, description })
    if (res.suite) {
      setSuites((s) => s.map((x) => x.id === suiteId ? res.suite : x))
      // Also patch test cases list in case the suite name is rendered
      setTestCases((cs) => cs.map((c) => c.suite_id === suiteId ? { ...c, suite_name: res.suite.name } : c))
    }
    return res.suite as TestSuite
  }, [projectId])

  const deleteSuite = useCallback(async (suiteId: string | number) => {
    await api.delete(`/projects/${projectId}/test-suites/${suiteId}`)
    setSuites((s) => s.filter((x) => x.id !== suiteId))
    // Remove any test cases belonging to the deleted suite from the local list
    setTestCases((cs) => cs.filter((c) => String(c.suite_id) !== String(suiteId)))
  }, [projectId])

  /* ── Test case mutations ────────────────────────────────────── */
  const createTestCase = useCallback(async (input: {
    title: string
    suite_id: number | string
    priority?: TestPriority
    status?: TestStatus
    task_id?: number | string | null
    assigned_tester_id?: number | string | null
    assignee_ids?: (number | string)[]
    preconditions?: string | null
    expected_result?: string | null
    actual_result?: string | null
    steps?: Array<{ description: string; expected_result?: string | null }>
  }) => {
    const res = await api.post(`/projects/${projectId}/test-cases`, input)
    if (res.testCase) {
      // Bump suite counts
      setSuites((s) => s.map((x) => String(x.id) === String(res.testCase.suite_id)
        ? { ...x, test_case_count: x.test_case_count + 1 }
        : x))
      // Prepend to the visible list (so the user sees their new TC)
      setTestCases((cs) => [res.testCase, ...cs])
      setTotal((t) => t + 1)
    }
    return res.testCase as TestCase
  }, [projectId])

  const updateTestCase = useCallback(async (caseId: string | number, partial: Partial<TestCase> & { steps?: any[]; assignee_ids?: (number | string)[] }) => {
    const res = await api.put(`/projects/${projectId}/test-cases/${caseId}`, partial)
    if (res.testCase) {
      const updated = res.testCase as TestCase
      setTestCases((cs) => cs.map((c) => String(c.id) === String(caseId) ? { ...c, ...updated } : c))
    }
    return res.testCase as TestCase
  }, [projectId])

  // Inline status update (PATCH)
  const updateStatus = useCallback(async (caseId: string | number, status: TestStatus) => {
    const res = await api.patch(`/projects/${projectId}/test-cases/${caseId}/status`, { status })
    if (res.ok) {
      setTestCases((cs) => cs.map((c) => String(c.id) === String(caseId) ? { ...c, status } : c))
    }
    return res
  }, [projectId])

  // Inline priority update (PATCH)
  const updatePriority = useCallback(async (caseId: string | number, priority: TestPriority) => {
    const res = await api.patch(`/projects/${projectId}/test-cases/${caseId}/priority`, { priority })
    if (res.ok) {
      setTestCases((cs) => cs.map((c) => String(c.id) === String(caseId) ? { ...c, priority } : c))
    }
    return res
  }, [projectId])

  // Patch a single test case in the list (used by DetailPanel to sync list after assignee updates)
  const patchTestCase = useCallback((caseId: string | number, partial: Partial<TestCase>) => {
    setTestCases((cs) => cs.map((c) => String(c.id) === String(caseId) ? { ...c, ...partial } : c))
  }, [])

  const deleteTestCase = useCallback(async (caseId: string | number) => {
    // Look up the suite_id BEFORE we drop the row, so we can decrement its count.
    let suiteId: string | number | null = null
    setTestCases((cs) => {
      const found = cs.find((c) => String(c.id) === String(caseId))
      if (found) suiteId = found.suite_id
      return cs.filter((c) => String(c.id) !== String(caseId))
    })
    await api.delete(`/projects/${projectId}/test-cases/${caseId}`)
    if (suiteId != null) {
      setSuites((s) => s.map((x) => String(x.id) === String(suiteId)
        ? { ...x, test_case_count: Math.max(0, x.test_case_count - 1) }
        : x))
    }
    setTotal((t) => Math.max(0, t - 1))
  }, [projectId])

  /* ── Filter / pagination setters ────────────────────────────── */
  const setSearch = useCallback((search: string) => {
    setPage(1)
    setFilters((f) => ({ ...f, search }))
  }, [])
  const setSuiteFilter = useCallback((suite_id: number | string | null) => {
    setPage(1)
    setFilters((f) => ({ ...f, suite_id }))
  }, [])
  const setStatusFilter = useCallback((status: TestStatus | null) => {
    setPage(1)
    setFilters((f) => ({ ...f, status }))
  }, [])
  const setPriorityFilter = useCallback((priority: TestPriority | null) => {
    setPage(1)
    setFilters((f) => ({ ...f, priority }))
  }, [])
  const setAssignedToMeFilter = useCallback((assigned_to_me: boolean) => {
    setPage(1)
    setFilters((f) => ({ ...f, assigned_to_me }))
  }, [])
  const setPerPageExternal = useCallback((n: number) => {
    setPage(1)
    setPerPage(n)
  }, [])

  return {
    suites,
    testCases,
    total,
    page,
    perPage,
    loading,
    error,
    refresh,
    createSuite,
    renameSuite,
    deleteSuite,
    createTestCase,
    updateTestCase,
    updateStatus,
    updatePriority,
    patchTestCase,
    deleteTestCase,
    setSearch,
    setSuiteFilter,
    setStatusFilter,
    setPriorityFilter,
    setAssignedToMeFilter,
    setPage,
    setPerPage: setPerPageExternal,
  }
}

/* ─── Detail hook ────────────────────────────────────────────── */
export function useTestCaseDetail(projectId: string | number, caseId: string | number | null) {
  const [testCase, setTestCase] = useState<TestCase | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const alive = useRef(true)

  const fetchOne = useCallback(async () => {
    if (!projectId || !caseId) {
      setTestCase(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await api.get(`/projects/${projectId}/test-cases/${caseId}`)
      if (!alive.current) return
      setTestCase(res.testCase || null)
    } catch (e: any) {
      if (!alive.current) return
      setError(e?.message || 'Failed to load test case')
    } finally {
      if (alive.current) setLoading(false)
    }
  }, [projectId, caseId])

  useEffect(() => {
    alive.current = true
    fetchOne()
    return () => { alive.current = false }
  }, [fetchOne])

  /* ── Edit the top-level fields ──────────────────────────────── */
  const updateFields = useCallback(async (partial: Partial<TestCase> & { steps?: any[]; assignee_ids?: (number | string)[] }) => {
    if (!caseId) return null
    const res = await api.put(`/projects/${projectId}/test-cases/${caseId}`, partial)
    if (res.testCase) {
      setTestCase(res.testCase)
    }
    return res.testCase as TestCase
  }, [projectId, caseId])

  /* ── Inline status/priority (detail panel) ────────────────────── */
  const updateStatus = useCallback(async (status: TestStatus) => {
    if (!caseId) return null
    const res = await api.patch(`/projects/${projectId}/test-cases/${caseId}/status`, { status })
    if (res.ok) {
      setTestCase((tc) => tc ? { ...tc, status } : tc)
    }
    return res
  }, [projectId, caseId])

  const updatePriority = useCallback(async (priority: TestPriority) => {
    if (!caseId) return null
    const res = await api.patch(`/projects/${projectId}/test-cases/${caseId}/priority`, { priority })
    if (res.ok) {
      setTestCase((tc) => tc ? { ...tc, priority } : tc)
    }
    return res
  }, [projectId, caseId])

  /* ── Steps ──────────────────────────────────────────────────── */
  const addStep = useCallback(async (description: string, expected_result?: string | null) => {
    if (!caseId) return null
    const res = await api.post(`/projects/${projectId}/test-cases/${caseId}/steps`, { description, expected_result })
    if (res.step) {
      setTestCase((tc) => tc ? { ...tc, steps: [...(tc.steps || []), res.step] } : tc)
    }
    return res.step as TestStep
  }, [projectId, caseId])

  const updateStep = useCallback(async (stepId: string | number, partial: Partial<TestStep>) => {
    if (!caseId) return null
    const res = await api.put(`/projects/${projectId}/test-cases/${caseId}/steps/${stepId}`, partial)
    if (res.step) {
      setTestCase((tc) => tc
        ? { ...tc, steps: (tc.steps || []).map((s) => String(s.id) === String(stepId) ? res.step : s) }
        : tc)
    }
    return res.step as TestStep
  }, [projectId, caseId])

  const deleteStep = useCallback(async (stepId: string | number) => {
    if (!caseId) return null
    await api.delete(`/projects/${projectId}/test-cases/${caseId}/steps/${stepId}`)
    setTestCase((tc) => tc
      ? { ...tc, steps: (tc.steps || []).filter((s) => String(s.id) !== String(stepId)) }
      : tc)
  }, [projectId, caseId])

  /* ── Comments ───────────────────────────────────────────────── */
  const addComment = useCallback(async (body: string) => {
    if (!caseId) return null
    const res = await api.post(`/projects/${projectId}/test-cases/${caseId}/comments`, { body })
    if (res.comment) {
      setTestCase((tc) => tc ? { ...tc, comments: [...(tc.comments || []), res.comment] } : tc)
    }
    return res.comment as TestComment
  }, [projectId, caseId])

  const editComment = useCallback(async (commentId: string | number, body: string) => {
    if (!caseId) return null
    const res = await api.put(`/projects/${projectId}/test-cases/${caseId}/comments/${commentId}`, { body })
    if (res.comment) {
      setTestCase((tc) => tc
        ? { ...tc, comments: (tc.comments || []).map((c) => String(c.id) === String(commentId) ? res.comment : c) }
        : tc)
    }
    return res.comment as TestComment
  }, [projectId, caseId])

  const deleteComment = useCallback(async (commentId: string | number) => {
    if (!caseId) return null
    await api.delete(`/projects/${projectId}/test-cases/${caseId}/comments/${commentId}`)
    setTestCase((tc) => tc
      ? { ...tc, comments: (tc.comments || []).filter((c) => String(c.id) !== String(commentId)) }
      : tc)
  }, [projectId, caseId])

  /* ── Reactions ──────────────────────────────────────────────── */
  const toggleReaction = useCallback(async (commentId: string | number, emoji: string, oldEmoji?: string) => {
    if (!caseId) return
    try {
      const body = oldEmoji && oldEmoji !== emoji ? { emoji, old_emoji: oldEmoji } : { emoji }
      const res = await api.post(`/projects/${projectId}/test-cases/${caseId}/comments/${commentId}/reactions`, body)
      if (res.reactions != null) {
        setTestCase((tc) => tc
          ? { ...tc, comments: (tc.comments || []).map((c) => String(c.id) === String(commentId) ? { ...c, reactions: res.reactions } : c) }
          : tc)
      }
    } catch (e: any) { throw new Error(e?.message || 'Failed to toggle reaction') }
  }, [projectId, caseId])

  /* ── Attachments ────────────────────────────────────────────── */
  const uploadAttachment = useCallback(async (file: File) => {
    if (!caseId) return null
    const fd = new FormData()
    fd.append('file', file)
    const token = (typeof window !== 'undefined') ? localStorage.getItem('token') : ''
    const res = await fetch(`/api/projects/${projectId}/test-cases/${caseId}/attachments`, {
      method: 'POST',
      headers: token ? { 'Authorization': 'Bearer' + ' ' + token } : {},
      body: fd,
    })
    const j = await res.json()
    if (!res.ok) throw new Error(j?.message || 'Upload failed')
    if (j.attachment) {
      setTestCase((tc) => tc ? { ...tc, attachments: [...(tc.attachments || []), j.attachment] } : tc)
    }
    return j.attachment as TestAttachment
  }, [projectId, caseId])

  const deleteAttachment = useCallback(async (attachmentId: string | number) => {
    if (!caseId) return null
    await api.delete(`/projects/${projectId}/test-cases/${caseId}/attachments/${attachmentId}`)
    setTestCase((tc) => tc
      ? { ...tc, attachments: (tc.attachments || []).filter((a) => String(a.id) !== String(attachmentId)) }
      : tc)
  }, [projectId, caseId])

  /* ── Assignee execution status update ─────────────────────── */
  const updateAssigneeStatus = useCallback(async (userId: number | string, executionStatus: ExecutionStatus) => {
    if (!caseId) return
    try {
      const res = await api.patch(`/projects/${projectId}/test-cases/${caseId}/assignees/${userId}/status`, { execution_status: executionStatus })
      if (res) {
        setTestCase((tc) => tc
          ? {
              ...tc,
              assignees: Array.isArray(res.assignees) ? res.assignees : tc.assignees,
              passed_count: res.passed_count ?? tc.passed_count,
              failed_count: res.failed_count ?? tc.failed_count,
              pending_count: res.pending_count ?? tc.pending_count,
              total_assignees: res.total_assignees ?? tc.total_assignees,
              status: res.status ?? tc.status,
              computed_status: res.computed_status ?? tc.computed_status,
              effective_status: res.status ?? tc.effective_status ?? tc.status,
            }
          : tc)
      }
    } catch (e: any) { throw new Error(e?.message || e?.response?.data?.message || 'Failed to update execution status') }
  }, [projectId, caseId])

  return {
    testCase, loading, error,
    refresh: fetchOne,
    updateFields,
    updateStatus,
    updatePriority,
    addStep, updateStep, deleteStep,
    addComment, editComment, deleteComment, toggleReaction,
    uploadAttachment, deleteAttachment,
    updateAssigneeStatus,
  }
}
