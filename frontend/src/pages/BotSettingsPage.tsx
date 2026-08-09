import { useState, useEffect } from 'react';
import { api } from '../services/api';

interface AutoReplyRule {
  id: number;
  keyword: string;
  match_type: string;
  reply_text: string;
  is_active: number;
  match_count: number;
  delay_min: number;
  delay_max: number;
  cooldown: number;
  scope: string;
  priority: number;
  match_mode: string;
  created_at: number;
  updated_at: number;
}

interface AutoReplyLog {
  id: number;
  rule_id: number;
  from_user_id: number;
  from_user_name: string;
  keyword: string;
  reply_text: string;
  rule_keyword?: string;
  created_at: number;
}

export default function BotSettingsPage() {
  const [rules, setRules] = useState<AutoReplyRule[]>([]);
  const [logs, setLogs] = useState<AutoReplyLog[]>([]);
  const [activeTab, setActiveTab] = useState<'rules' | 'logs' | 'test'>('rules');
  const [botEnabled, setBotEnabled] = useState(true);
  
  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<AutoReplyRule | null>(null);
  const [keyword, setKeyword] = useState('');
  const [matchType, setMatchType] = useState('contains');
  const [replyText, setReplyText] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [delayMin, setDelayMin] = useState(0);
  const [delayMax, setDelayMax] = useState(0);
  const [cooldown, setCooldown] = useState(0);
  const [scope, setScope] = useState('private');
  const [priority, setPriority] = useState(0);
  const [matchMode, setMatchMode] = useState('any');
  
  // Test state
  const [testText, setTestText] = useState('');
  const [testResults, setTestResults] = useState<any[]>([]);

  useEffect(() => {
    loadRules();
    loadLogs();
    loadStatus();
  }, []);

  const loadStatus = async () => {
    try {
      const res = await api.bot.getStatus();
      if (res.success) setBotEnabled(res.enabled);
    } catch {}
  };

  const handleToggleBot = async () => {
    try {
      const newVal = !botEnabled;
      const res = await api.bot.setStatus(newVal);
      if (res.success) setBotEnabled(res.enabled);
    } catch {}
  };

  const loadRules = async () => {
    try {
      const res = await api.bot.getRules();
      if (res.success) setRules(res.rules);
    } catch {}
  };

  const loadLogs = async () => {
    try {
      const res = await api.bot.getLogs();
      if (res.success) setLogs(res.logs);
    } catch {}
  };

  const handleSubmit = async () => {
    if (!keyword.trim() || !replyText.trim()) {
      alert('关键词和回复内容不能为空');
      return;
    }
    
    try {
      const payload = { keyword, match_type: matchType, reply_text: replyText, is_active: isActive, delay_min: delayMin, delay_max: delayMax, cooldown, scope, priority, match_mode: matchMode };
      if (editingRule) {
        await api.bot.updateRule(editingRule.id, payload);
      } else {
        await api.bot.createRule(keyword, matchType, replyText, isActive, delayMin, delayMax, cooldown, scope, priority, matchMode);
      }
      resetForm();
      loadRules();
    } catch (e: any) {
      alert('操作失败: ' + e.message);
    }
  };

  const handleEdit = (rule: AutoReplyRule) => {
    setEditingRule(rule);
    setKeyword(rule.keyword);
    setMatchType(rule.match_type);
    setReplyText(rule.reply_text);
    setIsActive(rule.is_active === 1);
    setDelayMin(rule.delay_min || 0);
    setDelayMax(rule.delay_max || 0);
    setCooldown(rule.cooldown || 0);
    setScope(rule.scope || 'private');
    setPriority(rule.priority || 0);
    setMatchMode(rule.match_mode || 'any');
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这条规则吗？')) return;
    await api.bot.deleteRule(id);
    loadRules();
  };

  const handleToggle = async (rule: AutoReplyRule) => {
    await api.bot.updateRule(rule.id, { is_active: !rule.is_active });
    loadRules();
  };

  const handleTest = async () => {
    if (!testText.trim()) return;
    const res = await api.bot.testMatch(testText);
    if (res.success) setTestResults(res.matched);
  };

  const handleClearLogs = async () => {
    if (!confirm('确定要清空所有日志吗？')) return;
    await api.bot.clearLogs();
    loadLogs();
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingRule(null);
    setKeyword('');
    setMatchType('contains');
    setReplyText('');
    setIsActive(true);
    setDelayMin(0);
    setDelayMax(0);
    setCooldown(0);
    setScope('private');
    setPriority(0);
    setMatchMode('any');
  };

  const matchTypeLabels: Record<string, string> = {
    contains: '包含',
    exact: '完全匹配',
    starts: '开头匹配',
    ends: '结尾匹配',
    regex: '正则表达式',
  };

  const scopeLabels: Record<string, string> = {
    private: '私聊',
    group: '群组',
    both: '全部',
  };

  const formatTime = (ts: number) => {
    return new Date(ts * 1000).toLocaleString('zh-CN');
  };

  const getKeywords = (kw: string) => {
    return kw.split(/[,，]/).map(k => k.trim()).filter(Boolean);
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-800">🤖 机器人设置</h1>
            <p className="text-sm text-gray-500 mt-1">配置关键词自动回复规则</p>
          </div>
          <button
            onClick={handleToggleBot}
            className={`relative inline-flex h-8 w-16 items-center rounded-full transition-colors ${
              botEnabled ? 'bg-green-500' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform ${
                botEnabled ? 'translate-x-9' : 'translate-x-1'
              }`}
            />
            <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-xs whitespace-nowrap text-gray-500">
              {botEnabled ? '运行中' : '已停止'}
            </span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-6 mt-4">
        <div className="flex gap-6">
          <button
            className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'rules' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab('rules')}
          >
            关键词规则 ({rules.length})
          </button>
          <button
            className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'logs' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab('logs')}
          >
            触发日志 ({logs.length})
          </button>
          <button
            className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'test' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab('test')}
          >
            测试匹配
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {/* Rules Tab */}
        {activeTab === 'rules' && (
          <div>
            <div className="mb-4 flex justify-between items-center">
              <h2 className="text-lg font-medium text-gray-800">自动回复规则</h2>
              <button
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm"
                onClick={() => setShowForm(true)}
              >
                + 新建规则
              </button>
            </div>

            {/* Form Modal */}
            {showForm && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-white rounded-xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
                  <h3 className="text-lg font-medium mb-4">{editingRule ? '编辑规则' : '新建规则'}</h3>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">关键词</label>
                      <input
                        type="text"
                        value={keyword}
                        onChange={(e) => setKeyword(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        placeholder="多个关键词用逗号分隔，如：你好,hi,hello"
                      />
                      <p className="text-xs text-gray-400 mt-1">多个关键词用逗号（,）分隔</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">匹配方式</label>
                        <select
                          value={matchType}
                          onChange={(e) => setMatchType(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        >
                          <option value="contains">包含</option>
                          <option value="exact">完全匹配</option>
                          <option value="starts">开头匹配</option>
                          <option value="ends">结尾匹配</option>
                          <option value="regex">正则表达式</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">多词关系</label>
                        <select
                          value={matchMode}
                          onChange={(e) => setMatchMode(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        >
                          <option value="any">任一匹配 (OR)</option>
                          <option value="all">全部匹配 (AND)</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">作用范围</label>
                      <select
                        value={scope}
                        onChange={(e) => setScope(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      >
                        <option value="private">仅私聊</option>
                        <option value="group">仅群组</option>
                        <option value="both">全部</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        优先级 <span className="text-gray-400 font-normal">（数字越大优先级越高）</span>
                      </label>
                      <input
                        type="number"
                        value={priority}
                        onChange={(e) => setPriority(Number(e.target.value))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        min={0}
                        placeholder="0"
                      />
                      <p className="text-xs text-gray-400 mt-1">多条规则同时匹配时，优先触发优先级高的规则</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">回复内容</label>
                      <textarea
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        rows={3}
                        placeholder="支持模板变量：{name} {keyword} {time} {date} {weekday} {input} {random:选项1|选项2}"
                      />
                      <div className="mt-2 p-2 bg-gray-50 rounded text-xs text-gray-500 space-y-0.5">
                        <p><code className="text-blue-600">{'{name}'}</code> 发送者昵称</p>
                        <p><code className="text-blue-600">{'{keyword}'}</code> 匹配到的关键词</p>
                        <p><code className="text-blue-600">{'{time}'}</code> 当前时间（如 14:30）</p>
                        <p><code className="text-blue-600">{'{date}'}</code> 当前日期</p>
                        <p><code className="text-blue-600">{'{weekday}'}</code> 星期几</p>
                        <p><code className="text-blue-600">{'{input}'}</code> 用户发送的完整消息</p>
                        <p><code className="text-blue-600">{'{random:A|B|C}'}</code> 随机选一个</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">最小延迟(秒)</label>
                        <input
                          type="number"
                          value={delayMin}
                          onChange={(e) => setDelayMin(Number(e.target.value))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                          min={0}
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">最大延迟(秒)</label>
                        <input
                          type="number"
                          value={delayMax}
                          onChange={(e) => setDelayMax(Number(e.target.value))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                          min={0}
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">冷却(秒)</label>
                        <input
                          type="number"
                          value={cooldown}
                          onChange={(e) => setCooldown(Number(e.target.value))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                          min={0}
                          placeholder="0"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-gray-400">💡 延迟：随机等待几秒再回复，模拟真人。冷却：同一用户X秒内不重复回复。设0则不启用。</p>
                    
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="isActive"
                        checked={isActive}
                        onChange={(e) => setIsActive(e.target.checked)}
                        className="w-4 h-4 text-blue-500"
                      />
                      <label htmlFor="isActive" className="text-sm text-gray-700">启用此规则</label>
                    </div>
                  </div>
                  
                  <div className="flex justify-end gap-3 mt-6">
                    <button
                      className="px-4 py-2 text-gray-600 hover:text-gray-800"
                      onClick={resetForm}
                    >
                      取消
                    </button>
                    <button
                      className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                      onClick={handleSubmit}
                    >
                      {editingRule ? '保存' : '创建'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Rules List */}
            {rules.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <div className="text-4xl mb-3">📋</div>
                <p>还没有配置任何规则</p>
                <p className="text-sm mt-1">点击"新建规则"开始配置自动回复</p>
              </div>
            ) : (
              <div className="space-y-3">
                {rules.map((rule) => {
                  const kws = getKeywords(rule.keyword);
                  return (
                    <div
                      key={rule.id}
                      className={`bg-white rounded-lg p-4 border ${rule.is_active ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full">
                              {matchTypeLabels[rule.match_type]}
                            </span>
                            <span className="px-2 py-0.5 bg-purple-50 text-purple-700 text-xs rounded-full">
                              {scopeLabels[rule.scope] || '私聊'}
                            </span>
                            <span className={`px-2 py-0.5 text-xs rounded-full ${
                              rule.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                            }`}>
                              {rule.is_active ? '已启用' : '已禁用'}
                            </span>
                            {(rule.priority || 0) > 0 && (
                              <span className="px-2 py-0.5 bg-red-50 text-red-700 text-xs rounded-full">
                                优先级 {rule.priority}
                              </span>
                            )}
                            {kws.length > 1 && (
                              <span className="px-2 py-0.5 bg-amber-50 text-amber-700 text-xs rounded-full">
                                {rule.match_mode === 'all' ? '全部匹配(AND)' : '任一匹配(OR)'} · {kws.length}个词
                              </span>
                            )}
                            <span className="text-xs text-gray-400">触发 {rule.match_count} 次</span>
                            {(rule.delay_min > 0 || rule.delay_max > 0) && (
                              <span className="px-2 py-0.5 bg-yellow-50 text-yellow-700 text-xs rounded-full">
                                延迟 {rule.delay_min}-{rule.delay_max}s
                              </span>
                            )}
                            {rule.cooldown > 0 && (
                              <span className="px-2 py-0.5 bg-orange-50 text-orange-700 text-xs rounded-full">
                                冷却 {rule.cooldown}s
                              </span>
                            )}
                          </div>
                          <div className="mb-1">
                            <span className="text-sm text-gray-500">关键词：</span>
                            {kws.map((kw, i) => (
                              <span key={i} className="inline-block mr-1 mb-1 px-2 py-0.5 bg-gray-100 text-gray-800 text-sm rounded">
                                {kw}
                              </span>
                            ))}
                          </div>
                          <div>
                            <span className="text-sm text-gray-500">回复：</span>
                            <span className="text-sm text-gray-700">{rule.reply_text}</span>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2 ml-4">
                          <button
                            className="text-sm text-gray-500 hover:text-blue-500"
                            onClick={() => handleToggle(rule)}
                            title={rule.is_active ? '禁用' : '启用'}
                          >
                            {rule.is_active ? '⏸' : '▶️'}
                          </button>
                          <button
                            className="text-sm text-gray-500 hover:text-blue-600"
                            onClick={() => handleEdit(rule)}
                          >
                            ✏️
                          </button>
                          <button
                            className="text-sm text-gray-500 hover:text-red-600"
                            onClick={() => handleDelete(rule.id)}
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Logs Tab */}
        {activeTab === 'logs' && (
          <div>
            <div className="mb-4 flex justify-between items-center">
              <h2 className="text-lg font-medium text-gray-800">触发日志</h2>
              {logs.length > 0 && (
                <button
                  className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded"
                  onClick={handleClearLogs}
                >
                  清空日志
                </button>
              )}
            </div>

            {logs.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <div className="text-4xl mb-3">📝</div>
                <p>还没有触发记录</p>
              </div>
            ) : (
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left text-gray-600 font-medium">时间</th>
                      <th className="px-4 py-3 text-left text-gray-600 font-medium">用户</th>
                      <th className="px-4 py-3 text-left text-gray-600 font-medium">关键词</th>
                      <th className="px-4 py-3 text-left text-gray-600 font-medium">回复内容</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-500">{formatTime(log.created_at)}</td>
                        <td className="px-4 py-3">
                          <span className="text-gray-800">{log.from_user_name || `User ${log.from_user_id}`}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded">{log.keyword}</span>
                        </td>
                        <td className="px-4 py-3 text-gray-700 max-w-xs truncate">{log.reply_text}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Test Tab */}
        {activeTab === 'test' && (
          <div>
            <h2 className="text-lg font-medium text-gray-800 mb-4">测试匹配</h2>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">输入测试文本</label>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={testText}
                  onChange={(e) => setTestText(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  placeholder="输入一段文本，测试哪些规则会匹配"
                  onKeyDown={(e) => e.key === 'Enter' && handleTest()}
                />
                <button
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                  onClick={handleTest}
                >
                  测试
                </button>
              </div>
              
              {testResults.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">匹配到 {testResults.length} 条规则：</h3>
                  <div className="space-y-2">
                    {testResults.map((r, i) => (
                      <div key={i} className="p-3 bg-green-50 border border-green-200 rounded-lg">
                        <div className="text-sm flex items-center gap-2">
                          <span className="text-gray-500">规则 #{r.id}</span>
                          {(r.priority || 0) > 0 && (
                            <span className="px-1.5 py-0.5 bg-red-50 text-red-600 text-xs rounded">优先级 {r.priority}</span>
                          )}
                          <span className="font-medium">{r.keyword}</span>
                          <span className="text-gray-400 mx-2">→</span>
                          <span className="text-green-700">{r.reply_text}</span>
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          {scopeLabels[r.scope] || '私聊'} | {matchTypeLabels[r.match_type]}
                          {r.match_mode === 'all' ? ' | 全部匹配(AND)' : ' | 任一匹配(OR)'}
                          {(r.delay_min > 0 || r.delay_max > 0) && ` | 延迟${r.delay_min}-${r.delay_max}s`}
                          {r.cooldown > 0 && ` | 冷却${r.cooldown}s`}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {testText && testResults.length === 0 && (
                <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-500">
                  没有匹配到任何规则
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
