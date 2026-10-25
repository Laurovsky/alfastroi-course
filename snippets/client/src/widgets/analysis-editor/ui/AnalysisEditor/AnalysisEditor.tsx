import { renderAnalysisActAttachments } from '../AnalysisActAttachments/renderAnalysisActAttachments';
import { useAnalysisTkpImport } from '@/features/import-analysis-tkp';
import {
  RefreshFromOneCButton,
  PILOT_WORK_ITEM_ID,
  canRefreshPilot,
  refreshPilotFromOneC
} from '@/features/refresh-analysis-from-1c';
import { AdditionalActsSection } from '@/features/manage-additional-acts';
import { AllocationsTab } from '@/features/edit-allocations';
import { useAuthStore } from '@/entities/session';
import { useAnalysisHistory, useAnalysisLastRejection } from '@/entities/analysis';
import { Button } from '@gravity-ui/uikit';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  AnalysisEditorContext,
  AnalysisSaveContext,
  useAnalysisSaveParticipant,
  useAnalysisMetadataEditing
} from '@/features/edit-analysis';
import { AnalysisEditorHeader } from '../AnalysisEditorHeader';
import { AnalysisEditorTabs } from '../AnalysisEditorTabs';
import { AnalysisHistoryView } from '../AnalysisHistoryView';
import { AnalysisEditorToolbar } from '../AnalysisEditorToolbar';
import { AnalysisWorkItemsPanel } from '../AnalysisWorkItemsPanel';
import { AnalysisEditorFooter } from '../AnalysisEditorFooter';
import type { AnalysisEditorProps, AnalysisEditorState } from '../../model/types';
import { READ_ONLY_CAPABILITIES, useAnalysisEditorModel } from '../../model/useAnalysisEditorModel';
import { useAnalysisEditorNavigation } from '../../model/useAnalysisEditorNavigation';
import {
  useAnalysisEditorUiState,
  type AnalysisEditorTab
} from '../../model/useAnalysisEditorUiState';
import { useAnalysisEditorData } from '../../model/useAnalysisEditorData';
import { useAnalysisWorkItemsView } from '../../model/useAnalysisWorkItemsView';
import { useAnalysisWorkItemActions } from '../../model/useAnalysisWorkItemActions';
import styles from './AnalysisEditor.module.css';

/**
 * Собирает общий редактор конструктора и согласования анализа руководителем.
 *
 * Порядок чтения: scope/права → данные и строки таблицы → пользовательские
 * действия и feature модели → сохранение/навигация → UI-панели.
 *
 * {@link useAnalysisEditorModel} владеет coordinator и проверенной версией.
 * {@link useAnalysisEditorData} сохраняет владельцев запросов и кеша;
 * view/actions hooks вычисляют строки и различают обычные/актные правки.
 * Метаданные, импорт ТКП и история имеют свои scoped state/контракты.
 *
 * @remarks Оба provider остаются здесь: дочерние редакторы и widget attachment slot
 * используют общий coordinator. Переключение вкладок через hidden сохраняет
 * drafts. Согласование, экспорт и возврат с правками используют prepareDecision;
 * серверные capabilities определяют доступные действия.
 *
 * Карта файлов и lifecycle invariants находятся в README этого slice.
 */
export default function AnalysisEditor({
  analysisId: id,
  onBack,
  footer,
  readOnly = false,
  constructorScope = false
}: AnalysisEditorProps) {
  // 1. Владелец открытого редактора и действующие серверные права.
  const role = useAuthStore((s) => s.role);
  const model = useAnalysisEditorModel(id, constructorScope);
  const { access: serverAccess, coordinator, reloadAccess } = model;
  const access = useMemo(
    () =>
      readOnly
        ? {
            ...serverAccess,
            capabilities: {
              ...READ_ONLY_CAPABILITIES,
              canExport: serverAccess.capabilities.canExport
            }
          }
        : serverAccess,
    [serverAccess, readOnly]
  );
  const editorSession = useMemo(
    () => ({ access, saveCoordinator: coordinator }),
    [access, coordinator]
  );
  const canEditWorkItems = access.capabilities.canEditWorkItems;
  const canAllocate = true;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [tab, setTab] = useState<AnalysisEditorTab>('items');
  const isMutatingRef = useRef(false);
  // 2. Модели используют общий scope; выделение остаётся локальным.
  const data = useAnalysisEditorData(id, constructorScope, model.ready, coordinator, isMutatingRef);
  const {
    analysis,
    workItems,
    catalogItems,
    wiLoading,
    catalogLoading,
    analysesLoading,
    wiError,
    analysesError,
    systemsByPackage,
    fetchAnalyses,
    fetchWorkItems,
    getWorkItemVersion,
    refreshImportedAnalysis
  } = data;
  const selection = useAnalysisEditorUiState();
  const { selectedIds, setSelectedIds } = selection;
  const view = useAnalysisWorkItemsView(workItems, catalogItems, id);
  const { visibleWorkItems, totals, catalogById, selectableIds } = view;
  const workActions = useAnalysisWorkItemActions({
    id,
    selectedIds,
    setSelectedIds,
    selectableIds,
    isMutatingRef
  });
  const { batchDeleting, handleBatchDelete } = workActions;
  const metadata = useAnalysisMetadataEditing({ id, analysis, systemsByPackage, fetchAnalyses });
  const {
    systemEditing,
    systemSaving,
    selectedSystemId,
    setSelectedSystemId,
    setSystemEditing,
    handleSaveSystem,
    handleRenameAnalysis
  } = metadata;
  const tkpImport = useAnalysisTkpImport({
    analysisId: id,
    catalogById,
    hasWorkItems: workItems.length > 0,
    onImported: refreshImportedAnalysis
  });
  const {
    entries: historyEntries,
    loading: historyLoading,
    error: historyError,
    refresh: loadHistory
  } = useAnalysisHistory(id, tab === 'history');
  const lastRejection = useAnalysisLastRejection(id, analysis?.status);
  // 3. Открытые preview/drawer и правки метаданных входят в общий save barrier.
  useAnalysisSaveParticipant(
    'editor-previews-and-system',
    {
      hasDirty: () => systemEditing && selectedSystemId !== analysis?.system_id,
      hasError: () => !!tkpImport.preview || !!tkpImport.diffPreview || drawerOpen,
      flush: metadata.flushSystem
    },
    coordinator
  );
  const prepareDecision = useCallback(async () => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    if (!model.ready) return null;
    return coordinator.prepareDecision();
  }, [coordinator, model.ready]);
  const reload = useCallback(async () => {
    await reloadAccess();
  }, [reloadAccess]);
  const refreshFromOneC = useCallback(async () => {
    isMutatingRef.current = true;
    try {
      if ((await prepareDecision()) === null) return null;
      const result = await coordinator
        .enqueue(async (context) => {
          const workVersion = getWorkItemVersion(PILOT_WORK_ITEM_ID);
          if (workVersion === null)
            throw new Error('Не найдена пилотная работа. Обновите данные анализа');
          const response = await refreshPilotFromOneC(
            id,
            context.prev_analysis_version,
            workVersion
          );
          return { result: response, analysis_version: response.analysis_version };
        })
        .catch(async (error: unknown) => {
          // Re-read before allowing a retry: a timed-out write may have committed.
          // Reset only through the editor's verified read path, never blindly.
          await reloadAccess();
          throw error;
        });
      // Один полный снимок между проверками версии. reloadAccess сам читает
      // work-items и метаданные; targeted refresh здесь повторял те же GET.
      await reloadAccess();
      await loadHistory();
      return result;
    } finally {
      isMutatingRef.current = false;
    }
  }, [prepareDecision, coordinator, id, getWorkItemVersion, reloadAccess, loadHistory]);
  useAnalysisEditorNavigation(coordinator, prepareDecision);
  const handleBack = async () => {
    if (!coordinator.hasUnsaved() || (await prepareDecision()) !== null) onBack();
  };
  const editorState: AnalysisEditorState | null = analysis
    ? {
        analysis,
        analysisVersion: access.analysis_version,
        capabilities: access.capabilities,
        busy: model.busy,
        ready: model.ready,
        canSubmit: visibleWorkItems.some((r) => r.type !== 'section') && totals.missingRate === 0,
        prepareDecision,
        reload
      }
    : null;
  // 4. Композиция сохраняет provider, DOM и lifetime скрытых вкладок.
  return (
    <AnalysisSaveContext.Provider value={coordinator}>
      <AnalysisEditorContext.Provider value={access}>
        <div className={styles.root}>
          {model.error && (
            <div role='alert' className='ref-error'>
              {model.error}
              <Button onClick={() => window.location.reload()}>Обновить и проверить данные</Button>
            </div>
          )}
          <AnalysisEditorHeader
            analysis={analysis}
            capabilities={access.capabilities}
            loading={wiLoading || catalogLoading || analysesLoading}
            systemEditing={systemEditing}
            systemSaving={systemSaving}
            selectedSystemId={selectedSystemId}
            systemsByPackage={systemsByPackage}
            onBack={handleBack}
            onRename={handleRenameAnalysis}
            onSelectSystem={setSelectedSystemId}
            onSaveSystem={handleSaveSystem}
            onStartSystemEdit={() => {
              if (!analysis) return;
              setSelectedSystemId(analysis.system_id);
              setSystemEditing(true);
            }}
            onCancelSystemEdit={() => setSystemEditing(false)}
            actions={
              analysis && (
                <AnalysisEditorToolbar
                  analysis={analysis}
                  access={access}
                  tkpImport={tkpImport}
                  selectedIds={selectedIds}
                  batchDeleting={batchDeleting}
                  handleBatchDelete={handleBatchDelete}
                  setDrawerOpen={setDrawerOpen}
                  oneCAction={
                    canRefreshPilot(role, id, constructorScope && !readOnly) ? (
                      <RefreshFromOneCButton
                        key={id}
                        disabled={model.busy || !model.ready}
                        refresh={refreshFromOneC}
                      />
                    ) : undefined
                  }
                />
              )
            }
          >
            {/* Баннеры предупреждений */}
            {analysis && analysis.rate_set_id === null && (
              <div className={`rounded-lg px-4 py-2 mt-2 text-sm ${styles.container}`}>
                Набор расценок не привязан — привяжите набор, чтобы конструктор смог подобрать цены.
              </div>
            )}
            {(wiError || analysesError) && (
              <div
                role='alert'
                className={`rounded-lg px-4 py-2 mt-2 text-sm flex items-center justify-between gap-3 ${styles.errorText}`}
              >
                <span>{wiError || analysesError}</span>
                <Button
                  view='flat'
                  size='s'
                  onClick={() => {
                    void fetchAnalyses();
                    if (id) void fetchWorkItems(id);
                  }}
                >
                  Обновить данные
                </Button>
              </div>
            )}
            <AnalysisEditorTabs tab={tab} canAllocate={canAllocate} onChange={setTab} />
          </AnalysisEditorHeader>
          {/* end header block */}
          <div className={`px-6 py-4 ${styles.body}`}>
            {/* ─── Вкладка: История ──────────────────────────────────────────────── */}
            {tab === 'history' && (
              <AnalysisHistoryView
                entries={historyEntries}
                loading={historyLoading}
                error={historyError}
                onRefresh={loadHistory}
              />
            )}

            {model.ready && id && analysis && (
              <div hidden={tab !== 'acts'} className={styles.container2}>
                <AdditionalActsSection
                  renderAttachments={renderAnalysisActAttachments}
                  editorSession={editorSession}
                  analysisId={id}
                  role={role === 'engineer' ? 'engineer' : 'supervisor'}
                  displayContext='constructor'
                  packageId={analysis.package_id}
                />
              </div>
            )}

            {model.ready && id && (
              <div hidden={tab !== 'executors'}>
                <AllocationsTab
                  editorSession={editorSession}
                  analysisId={id}
                  workItems={workItems}
                  catalogItems={catalogItems}
                />
              </div>
            )}

            <AnalysisWorkItemsPanel
              analysisId={id}
              tab={tab}
              data={data}
              view={view}
              selection={selection}
              actions={workActions}
              lastRejection={lastRejection}
              canEditWorkItems={canEditWorkItems}
              tkpImport={tkpImport}
              drawerOpen={drawerOpen}
              setDrawerOpen={setDrawerOpen}
            />
          </div>

          <AnalysisEditorFooter view={view} editorState={editorState} footer={footer} />
        </div>
      </AnalysisEditorContext.Provider>
    </AnalysisSaveContext.Provider>
  );
}
