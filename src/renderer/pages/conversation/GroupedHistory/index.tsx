/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import DirectorySelectionModal from '@/renderer/components/settings/DirectorySelectionModal';
import { CronJobIndicator, useCronJobsMap } from '@/renderer/pages/cron';
import { DndContext, DragOverlay, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Button, Dropdown, Empty, Input, Menu, Modal } from '@arco-design/web-react';
import AionModal from '@/renderer/components/base/AionModal';
import { Delete, FolderOpen, More } from '@icon-park/react';
import classNames from 'classnames';
import { Down, Right } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import WorkspaceCollapse from '../components/WorkspaceCollapse';
import ConversationRow from './ConversationRow';
import DragOverlayContent from './DragOverlayContent';
import SortableConversationRow from './SortableConversationRow';
import { useBatchSelection } from './hooks/useBatchSelection';
import { useConversationActions } from './hooks/useConversationActions';
import { useConversations } from './hooks/useConversations';
import { useDragAndDrop } from './hooks/useDragAndDrop';
import { useExport } from './hooks/useExport';
import type { ConversationRowProps, WorkspaceGroupedHistoryProps } from './types';

const WorkspaceGroupedHistory: React.FC<WorkspaceGroupedHistoryProps> = ({
  onSessionClick,
  collapsed = false,
  tooltipEnabled = false,
  batchMode = false,
  onBatchModeChange,
  afterPinnedContent,
}) => {
  const { id } = useParams();
  const { t } = useTranslation();
  const { getJobStatus, markAsRead, setActiveConversation } = useCronJobsMap();
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => new Set());
  const toggleSection = useCallback((key: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Sync active conversation ref when route changes (for URL navigation)
  // This doesn't trigger state update, avoiding double render
  useEffect(() => {
    if (id) {
      setActiveConversation(id);
    }
  }, [id, setActiveConversation]);

  const {
    conversations,
    isConversationGenerating,
    hasCompletionUnread,
    expandedWorkspaces,
    pinnedConversations,
    timelineSections,
    handleToggleWorkspace,
  } = useConversations();

  const {
    selectedConversationIds,
    setSelectedConversationIds,
    selectedCount,
    allSelected,
    toggleSelectedConversation,
    handleToggleSelectAll,
  } = useBatchSelection(batchMode, conversations);

  const {
    renameModalVisible,
    renameModalName,
    setRenameModalName,
    renameLoading,
    dropdownVisibleId,
    handleConversationClick,
    handleDeleteClick,
    handleBatchDelete,
    handleEditStart,
    handleRenameConfirm,
    handleRenameCancel,
    handleTogglePin,
    handleMenuVisibleChange,
    handleOpenMenu,
    handleRemoveProject,
    removeProjectTarget,
    removeProjectLoading,
    handleRemoveProjectCancel,
    handleRemoveProjectConfirm,
  } = useConversationActions({
    batchMode,
    onSessionClick,
    onBatchModeChange,
    selectedConversationIds,
    setSelectedConversationIds,
    toggleSelectedConversation,
    markAsRead,
  });

  const {
    exportTask,
    exportModalVisible,
    exportTargetPath,
    exportModalLoading,
    showExportDirectorySelector,
    setShowExportDirectorySelector,
    closeExportModal,
    handleSelectExportDirectoryFromModal,
    handleSelectExportFolder,
    handleExportConversation,
    handleBatchExport,
    handleConfirmExport,
  } = useExport({
    conversations,
    selectedConversationIds,
    setSelectedConversationIds,
    onBatchModeChange,
  });

  const { sensors, activeId, activeConversation, handleDragStart, handleDragEnd, handleDragCancel, isDragEnabled } =
    useDragAndDrop({
      pinnedConversations,
      batchMode,
      collapsed,
    });

  const getConversationRowProps = useCallback(
    (conversation: TChatConversation): ConversationRowProps => ({
      conversation,
      isGenerating: isConversationGenerating(conversation.id),
      hasCompletionUnread: hasCompletionUnread(conversation.id),
      collapsed,
      tooltipEnabled,
      batchMode,
      checked: selectedConversationIds.has(conversation.id),
      selected: id === conversation.id,
      menuVisible: dropdownVisibleId !== null && dropdownVisibleId === conversation.id,
      onToggleChecked: toggleSelectedConversation,
      onConversationClick: handleConversationClick,
      onOpenMenu: handleOpenMenu,
      onMenuVisibleChange: handleMenuVisibleChange,
      onEditStart: handleEditStart,
      onDelete: handleDeleteClick,
      onExport: handleExportConversation,
      onTogglePin: handleTogglePin,
      getJobStatus,
    }),
    [
      collapsed,
      tooltipEnabled,
      batchMode,
      isConversationGenerating,
      hasCompletionUnread,
      selectedConversationIds,
      id,
      dropdownVisibleId,
      toggleSelectedConversation,
      handleConversationClick,
      handleOpenMenu,
      handleMenuVisibleChange,
      handleEditStart,
      handleDeleteClick,
      handleExportConversation,
      handleTogglePin,
      getJobStatus,
    ]
  );

  const renderConversation = (conversation: TChatConversation, dimIcon = false) => {
    const rowProps = getConversationRowProps(conversation);
    return <ConversationRow key={conversation.id} {...rowProps} dimIcon={dimIcon} />;
  };

  // Collect all sortable IDs for the pinned section
  const pinnedIds = useMemo(() => pinnedConversations.map((c) => c.id), [pinnedConversations]);

  // Codex-style split: project folders (workspaces) on top, free conversations below
  // 项目 section: collect all workspace groups across timeline sections, ordered by recency
  // 对话 section: keep timeline grouping (today/yesterday/...) but only show non-workspace conversations
  const projectGroups = useMemo(() => {
    const seen = new Set<string>();
    const groups: Array<{ workspace: string; displayName: string; conversations: TChatConversation[] }> = [];
    for (const section of timelineSections) {
      for (const item of section.items) {
        if (item.type === 'workspace' && item.workspaceGroup && !seen.has(item.workspaceGroup.workspace)) {
          seen.add(item.workspaceGroup.workspace);
          groups.push(item.workspaceGroup);
        }
      }
    }
    return groups;
  }, [timelineSections]);

  const conversationOnlySections = useMemo(
    () =>
      timelineSections
        .map((section) => ({
          ...section,
          items: section.items.filter((item) => item.type === 'conversation' && item.conversation),
        }))
        .filter((section) => section.items.length > 0),
    [timelineSections]
  );

  if (timelineSections.length === 0 && pinnedConversations.length === 0) {
    return (
      <>
        {afterPinnedContent}
        <div className='py-48px flex-center'>
          <Empty description={t('conversation.history.noHistory')} />
        </div>
      </>
    );
  }

  return (
    <>
      <Modal
        title={t('conversation.history.renameTitle')}
        visible={renameModalVisible}
        onOk={handleRenameConfirm}
        onCancel={handleRenameCancel}
        okText={t('conversation.history.saveName')}
        cancelText={t('conversation.history.cancelEdit')}
        confirmLoading={renameLoading}
        okButtonProps={{ disabled: !renameModalName.trim() }}
        style={{ borderRadius: '12px' }}
        alignCenter
        getPopupContainer={() => document.body}
      >
        <Input
          autoFocus
          value={renameModalName}
          onChange={setRenameModalName}
          onPressEnter={handleRenameConfirm}
          placeholder={t('conversation.history.renamePlaceholder')}
          allowClear
        />
      </Modal>

      <Modal
        visible={exportModalVisible}
        title={t('conversation.history.exportDialogTitle')}
        onCancel={closeExportModal}
        footer={null}
        style={{ borderRadius: '12px' }}
        className='conversation-export-modal'
        alignCenter
        getPopupContainer={() => document.body}
      >
        <div className='py-8px'>
          <div className='text-14px mb-16px text-t-secondary'>
            {exportTask?.mode === 'batch'
              ? t('conversation.history.exportDialogBatchDescription', { count: exportTask.conversationIds.length })
              : t('conversation.history.exportDialogSingleDescription')}
          </div>

          <div className='mb-16px p-16px rounded-12px bg-fill-1'>
            <div className='text-14px mb-8px text-t-primary'>{t('conversation.history.exportTargetFolder')}</div>
            <div
              className='flex items-center justify-between px-12px py-10px rounded-8px transition-colors'
              style={{
                backgroundColor: 'var(--color-bg-1)',
                border: '1px solid var(--color-border-2)',
                cursor: exportModalLoading ? 'not-allowed' : 'pointer',
                opacity: exportModalLoading ? 0.55 : 1,
              }}
              onClick={() => {
                void handleSelectExportFolder();
              }}
            >
              <span
                className='text-14px overflow-hidden text-ellipsis whitespace-nowrap'
                style={{ color: exportTargetPath ? 'var(--color-text-1)' : 'var(--color-text-3)' }}
              >
                {exportTargetPath || t('conversation.history.exportSelectFolder')}
              </span>
              <FolderOpen theme='outline' size='18' fill='var(--color-text-3)' />
            </div>
          </div>

          <div className='flex items-center gap-8px mb-20px text-14px text-t-secondary'>
            <span>💡</span>
            <span>{t('conversation.history.exportDialogHint')}</span>
          </div>

          <div className='flex gap-12px justify-end'>
            <button
              className='px-24px py-8px rounded-20px text-14px font-medium transition-all'
              style={{
                border: '1px solid var(--color-border-2)',
                backgroundColor: 'var(--color-fill-2)',
                color: 'var(--color-text-1)',
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.backgroundColor = 'var(--color-fill-3)';
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.backgroundColor = 'var(--color-fill-2)';
              }}
              onClick={closeExportModal}
            >
              {t('common.cancel')}
            </button>
            <button
              className='px-24px py-8px rounded-20px text-14px font-medium transition-all'
              style={{
                border: 'none',
                backgroundColor: exportModalLoading ? 'var(--color-fill-3)' : 'var(--color-text-1)',
                color: 'var(--color-bg-1)',
                cursor: exportModalLoading ? 'not-allowed' : 'pointer',
              }}
              onMouseEnter={(event) => {
                if (!exportModalLoading) {
                  event.currentTarget.style.opacity = '0.85';
                }
              }}
              onMouseLeave={(event) => {
                if (!exportModalLoading) {
                  event.currentTarget.style.opacity = '1';
                }
              }}
              onClick={() => {
                void handleConfirmExport();
              }}
              disabled={exportModalLoading}
            >
              {exportModalLoading ? t('conversation.history.exporting') : t('common.confirm')}
            </button>
          </div>
        </div>
      </Modal>

      <DirectorySelectionModal
        visible={showExportDirectorySelector}
        onConfirm={handleSelectExportDirectoryFromModal}
        onCancel={() => setShowExportDirectorySelector(false)}
      />

      {/* 移除项目确认弹窗 — 使用项目自家 AionModal + 圆角线框按钮（红色危险态） */}
      <AionModal
        visible={removeProjectTarget !== null}
        style={{ width: '400px' }}
        header={{
          title: t('conversation.history.removeProjectTitle', { defaultValue: '移除项目' }),
          showClose: true,
          style: { borderBottom: 'none' },
        }}
        onCancel={handleRemoveProjectCancel}
        footer={
          <div className='flex justify-end gap-12px pt-16px'>
            <button
              type='button'
              className='px-24px py-8px rounded-20px text-14px font-medium transition-all'
              style={{
                border: '1px solid var(--color-border-2)',
                backgroundColor: 'var(--color-fill-2)',
                color: 'var(--color-text-1)',
                cursor: removeProjectLoading ? 'not-allowed' : 'pointer',
                opacity: removeProjectLoading ? 0.55 : 1,
              }}
              onMouseEnter={(event) => {
                if (!removeProjectLoading) event.currentTarget.style.backgroundColor = 'var(--color-fill-3)';
              }}
              onMouseLeave={(event) => {
                if (!removeProjectLoading) event.currentTarget.style.backgroundColor = 'var(--color-fill-2)';
              }}
              onClick={handleRemoveProjectCancel}
              disabled={removeProjectLoading}
            >
              {t('conversation.history.cancelDelete')}
            </button>
            <button
              type='button'
              className='px-24px py-8px rounded-20px text-14px font-medium transition-all'
              style={{
                border: '1px solid rgb(var(--danger-6))',
                backgroundColor: 'transparent',
                color: 'rgb(var(--danger-6))',
                cursor: removeProjectLoading ? 'not-allowed' : 'pointer',
                opacity: removeProjectLoading ? 0.55 : 1,
              }}
              onMouseEnter={(event) => {
                if (!removeProjectLoading) {
                  event.currentTarget.style.backgroundColor = 'rgba(var(--danger-6), 0.08)';
                }
              }}
              onMouseLeave={(event) => {
                if (!removeProjectLoading) event.currentTarget.style.backgroundColor = 'transparent';
              }}
              onClick={() => void handleRemoveProjectConfirm()}
              disabled={removeProjectLoading}
            >
              {removeProjectLoading
                ? t('conversation.history.deleting', { defaultValue: '删除中…' })
                : t('conversation.history.confirmDelete')}
            </button>
          </div>
        }
      >
        <div className='text-14px leading-22px text-t-secondary'>
          {t('conversation.history.removeProjectConfirm', {
            name: removeProjectTarget?.name ?? '',
            count: removeProjectTarget?.conversations.length ?? 0,
            defaultValue: `确定要移除项目「${removeProjectTarget?.name ?? ''}」吗？项目下的 ${
              removeProjectTarget?.conversations.length ?? 0
            } 个对话将被一起删除，此操作无法撤销。`,
          })}
        </div>
      </AionModal>

      {batchMode && !collapsed && (
        <div className='px-12px pb-8px'>
          <div className='rd-8px bg-fill-1 p-10px flex flex-col gap-8px border border-solid border-[rgba(var(--primary-6),0.08)]'>
            <div className='text-12px leading-18px text-t-secondary'>
              {t('conversation.history.selectedCount', { count: selectedCount })}
            </div>
            <div className='grid grid-cols-2 gap-6px'>
              <Button
                className='!col-span-2 !w-full !justify-center !min-w-0 !h-30px !px-8px !text-12px whitespace-nowrap'
                size='mini'
                type='secondary'
                onClick={handleToggleSelectAll}
              >
                {allSelected ? t('common.cancel') : t('conversation.history.selectAll')}
              </Button>
              <Button
                className='!w-full !justify-center !min-w-0 !h-30px !px-8px !text-12px whitespace-nowrap'
                size='mini'
                type='secondary'
                onClick={handleBatchExport}
              >
                {t('conversation.history.batchExport')}
              </Button>
              <Button
                className='!w-full !justify-center !min-w-0 !h-30px !px-8px !text-12px whitespace-nowrap'
                size='mini'
                status='warning'
                onClick={handleBatchDelete}
              >
                {t('conversation.history.batchDelete')}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          {pinnedConversations.length > 0 && (
            <div className='mb-8px min-w-0'>
              {!collapsed && (
                <div
                  className='flex items-center px-12px py-8px cursor-pointer select-none sticky top-0 z-10 bg-fill-2'
                  onClick={() => toggleSection('pinned')}
                >
                  <span className='text-13px text-t-secondary font-bold leading-20px'>
                    {t('conversation.history.pinnedSection')}
                  </span>
                  <div className='ml-auto h-20px w-20px rd-4px flex items-center justify-center hover:bg-fill-3 transition-all shrink-0 text-t-secondary'>
                    {collapsedSections.has('pinned') ? (
                      <Right theme='outline' size={12} />
                    ) : (
                      <Down theme='outline' size={12} />
                    )}
                  </div>
                </div>
              )}
              {!collapsedSections.has('pinned') && (
                <SortableContext items={pinnedIds} strategy={verticalListSortingStrategy}>
                  <div className='min-w-0'>
                    {pinnedConversations.map((conversation) => {
                      const props = getConversationRowProps(conversation);
                      return isDragEnabled ? (
                        <SortableConversationRow key={conversation.id} {...props} />
                      ) : (
                        <ConversationRow key={conversation.id} {...props} />
                      );
                    })}
                  </div>
                </SortableContext>
              )}
            </div>
          )}

          <DragOverlay dropAnimation={null}>
            {activeId && activeConversation ? <DragOverlayContent conversation={activeConversation} /> : null}
          </DragOverlay>
        </DndContext>

        {afterPinnedContent}

        {/* 项目 section: Codex-style flat list of workspace folders */}
        {projectGroups.length > 0 && (
          <div className='mb-8px min-w-0'>
            {!collapsed && (
              <div
                className='flex items-center px-12px py-8px cursor-pointer select-none sticky top-0 z-10 bg-fill-2'
                onClick={() => toggleSection('projects')}
              >
                <span className='text-13px text-t-secondary font-bold leading-20px'>
                  {t('conversation.history.projectsSection', { defaultValue: '项目' })}
                </span>
                <div className='ml-auto h-20px w-20px rd-4px flex items-center justify-center hover:bg-fill-3 transition-all shrink-0 text-t-secondary'>
                  {collapsedSections.has('projects') ? (
                    <Right theme='outline' size={12} />
                  ) : (
                    <Down theme='outline' size={12} />
                  )}
                </div>
              </div>
            )}
            {!collapsedSections.has('projects') &&
              projectGroups.map((group) => {
                const projectMenu = (
                  <Menu
                    onClickMenuItem={(key) => {
                      if (key === 'remove') {
                        handleRemoveProject(group.displayName, group.conversations);
                      }
                    }}
                  >
                    <Menu.Item key='remove' className='!text-[rgb(var(--danger-6))]'>
                      <span className='flex items-center gap-8px'>
                        <Delete theme='outline' size='14' />
                        {t('conversation.history.removeProject', { defaultValue: '移除项目' })}
                      </span>
                    </Menu.Item>
                  </Menu>
                );
                return (
                  <div key={group.workspace} className='min-w-0'>
                    <WorkspaceCollapse
                      expanded={expandedWorkspaces.includes(group.workspace)}
                      onToggle={() => handleToggleWorkspace(group.workspace)}
                      siderCollapsed={collapsed}
                      header={
                        <div className='flex items-center gap-8px text-14px min-w-0'>
                          <span className='truncate flex-1 text-t-primary min-w-0'>{group.displayName}</span>
                        </div>
                      }
                      trailing={
                        <Dropdown
                          droplist={projectMenu}
                          trigger='click'
                          position='br'
                          getPopupContainer={() => document.body}
                          unmountOnExit={false}
                        >
                          <span
                            aria-label='Project actions'
                            className='hidden group-hover:flex flex-center cursor-pointer hover:bg-fill-2 rd-4px p-4px transition-colors text-t-primary'
                            onClick={(e) => e.stopPropagation()}
                          >
                            <More theme='outline' size={16} fill='currentColor' style={{ lineHeight: 0 }} />
                          </span>
                        </Dropdown>
                      }
                    >
                      <div className={classNames('flex flex-col gap-2px min-w-0', { 'mt-2px': !collapsed })}>
                        {group.conversations.map((conversation) => renderConversation(conversation, true))}
                      </div>
                    </WorkspaceCollapse>
                  </div>
                );
              })}
          </div>
        )}

        {/* 对话 section: Codex-style timeline of free (non-project) conversations */}
        {conversationOnlySections.map((section) => (
          <div key={section.timeline} className='mb-8px min-w-0'>
            {!collapsed && (
              <div
                className='flex items-center px-12px py-8px cursor-pointer select-none sticky top-0 z-10 bg-fill-2'
                onClick={() => toggleSection(section.timeline)}
              >
                <span className='text-13px text-t-secondary font-bold leading-20px'>{section.timeline}</span>
                <div className='ml-auto h-20px w-20px rd-4px flex items-center justify-center hover:bg-fill-3 transition-all shrink-0 text-t-secondary'>
                  {collapsedSections.has(section.timeline) ? (
                    <Right theme='outline' size={12} />
                  ) : (
                    <Down theme='outline' size={12} />
                  )}
                </div>
              </div>
            )}

            {!collapsedSections.has(section.timeline) &&
              section.items.map((item) =>
                item.type === 'conversation' && item.conversation ? renderConversation(item.conversation) : null
              )}
          </div>
        ))}
      </div>
    </>
  );
};

export default WorkspaceGroupedHistory;
