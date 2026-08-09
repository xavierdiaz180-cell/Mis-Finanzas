import React, { useState, useEffect, useRef } from 'react';
import { Bot, Send, Sparkles, Target, ShieldAlert, TrendingUp, AlertCircle, RefreshCw, CheckCircle2 } from 'lucide-react';
import { API_BASE } from '../config';

export default function CoachView({ onRefresh }) {
  const [messages, setMessages] = useState([
    {
      sender: 'coach',
      text: '¡Hola! Soy tu Coach Financiero personal. He analizado tus ingresos, gastos, liquidez disponible, deudas e inversiones. ¿En qué quieres que nos enfoquemos hoy? (Ej: "Cómo liquidar mis deudas más rápido", "Dónde me conviene invertir mi sobrante").'
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Recommendations & Freedom Goal
  const [recommendations, setRecommendations] = useState([]);
  const [financialGoal, setFinancialGoal] = useState({ target_age: 55, target_amount: 10000000 });
  const [summaryData, setSummaryData] = useState(null);

  // Goal Form Modal
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [editAge, setEditAge] = useState(55);
  const [editAmount, setEditAmount] = useState(10000000);

  const messagesEndRef = useRef(null);

  const loadData = () => {
    fetch(`${API_BASE}/api/coach/recommendations`)
      .then(res => res.json())
      .then(data => setRecommendations(data));

    fetch(`${API_BASE}/api/goals`)
      .then(res => res.json())
      .then(data => {
        if (data) {
          setFinancialGoal(data);
          setEditAge(data.target_age || 55);
          setEditAmount(data.target_amount || 10000000);
        }
      });

    fetch(`${API_BASE}/api/summary`)
      .then(res => res.json())
      .then(data => setSummaryData(data));
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!inputMessage.trim() || isLoading) return;

    const userText = inputMessage.trim();
    setMessages(prev => [...prev, { sender: 'user', text: userText }]);
    setInputMessage('');
    setIsLoading(true);

    fetch('/api/coach/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: userText, chat_history: messages })
    })
      .then(res => res.json())
      .then(data => {
        setIsLoading(false);
        setMessages(prev => [...prev, { sender: 'coach', text: data.reply }]);
      })
      .catch(err => {
        setIsLoading(false);
        setMessages(prev => [...prev, { sender: 'coach', text: 'Error de conexión con el Coach: ' + err.message }]);
      });
  };

  const handleSaveGoal = (e) => {
    e.preventDefault();
    fetch('/api/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_age: editAge, target_amount: editAmount })
    })
      .then(res => res.json())
      .then(() => {
        setShowGoalModal(false);
        loadData();
        if (onRefresh) onRefresh();
      });
  };

  const currentWealth = summaryData?.riqueza_neta || 0;
  const goalProgressPercentage = Math.min(100, (currentWealth / (financialGoal.target_amount || 1)) * 100);

  return (
    <div className="coach-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 360px', gap: '1.5rem' }}>
      
      {/* Left Column: Interactive Coach Chat */}
      <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', height: '780px', padding: '1.25rem' }}>
        
        {/* Chat Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border-subtle)', marginBottom: '1rem' }}>
          <div style={{ background: 'linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%)', padding: '0.6rem', borderRadius: 'var(--radius-sm)' }}>
            <Bot size={24} style={{ color: 'white' }} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#a78bfa' }}>Coach Financiero IA</h2>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Directo, claro y orientado a tus metas de libertad financiera.
            </span>
          </div>
        </div>

        {/* Message Log */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem', paddingRight: '0.5rem' }}>
          {messages.map((msg, index) => (
            <div 
              key={index}
              style={{
                alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
                background: msg.sender === 'user' ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' : 'rgba(139, 92, 246, 0.1)',
                border: msg.sender === 'user' ? 'none' : '1px solid rgba(139, 92, 246, 0.2)',
                padding: '0.85rem 1.1rem',
                borderRadius: 'var(--radius-md)',
                color: 'white',
                lineHeight: '1.5',
                fontSize: '0.92rem'
              }}
            >
              {msg.text.split('\n').map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          ))}
          {isLoading && (
            <div style={{ alignSelf: 'flex-start', background: 'rgba(139, 92, 246, 0.1)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', color: '#a78bfa' }}>
              Analizando tus datos financieros...
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-subtle)' }}>
          <input 
            type="text" 
            value={inputMessage}
            onChange={e => setInputMessage(e.target.value)}
            placeholder="Pregunta a tu Coach (Ej: ¿Qué deuda conviene pagar primero?)..."
            style={{ flex: 1, padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border-subtle)', color: 'white' }}
          />
          <button type="submit" className="nav-tab-btn active" style={{ padding: '0.75rem 1.25rem', background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)' }}>
            <Send size={16} /> Enviar
          </button>
        </form>

      </div>

      {/* Right Column: Freedom Goal & Prioritized Actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        
        {/* Freedom Goal Progress Card */}
        <div className="glass-card" style={{ borderLeft: '4px solid #a78bfa' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Target size={20} style={{ color: '#a78bfa' }} />
              <h3 style={{ fontSize: '1.1rem' }}>Libertad Financiera</h3>
            </div>
            <button onClick={() => setShowGoalModal(true)} style={{ background: 'transparent', border: 'none', color: '#60a5fa', fontSize: '0.78rem', cursor: 'pointer' }}>
              Configurar Meta
            </button>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Edad Objetivo: {financialGoal.target_age} años</div>
            <div style={{ fontSize: '1.6rem', fontWeight: '700', color: '#a78bfa', margin: '0.2rem 0' }}>
              ${(financialGoal.target_amount || 0).toLocaleString('es-MX')}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Patrimonio Actual: ${currentWealth.toLocaleString('es-MX')} ({goalProgressPercentage.toFixed(1)}%)
            </div>
          </div>

          {/* Progress Bar */}
          <div style={{ height: '10px', background: 'rgba(255,255,255,0.08)', borderRadius: '5px', overflow: 'hidden' }}>
            <div style={{ width: `${goalProgressPercentage}%`, height: '100%', background: 'linear-gradient(90deg, #8b5cf6 0%, #34d399 100%)', transition: 'width 0.5s ease' }} />
          </div>
        </div>

        {/* Prioritized Action Recommendations */}
        <div className="glass-card" style={{ flex: 1 }}>
          <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Sparkles size={18} style={{ color: '#fbbf24' }} /> Acciones Prioritarias Sugeridas
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {recommendations.map(rec => (
              <div 
                key={rec.id}
                style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid var(--border-subtle)',
                  borderLeft: `4px solid ${rec.priority === 'high' ? '#f43f5e' : rec.priority === 'medium' ? '#fbbf24' : '#60a5fa'}`,
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.85rem'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <span style={{ fontSize: '0.9rem', fontWeight: '600' }}>{rec.title}</span>
                  <span className={`badge ${rec.priority === 'high' ? 'badge-warning' : 'badge-info'}`}>
                    {rec.category}
                  </span>
                </div>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                  {rec.action}
                </p>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Impacto: {rec.impact}
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Goal Configuration Modal */}
      {showGoalModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '1rem' }}>
          <div className="glass-card" style={{ maxWidth: '420px', width: '100%' }}>
            <h3 style={{ fontSize: '1.2rem', marginBottom: '1.25rem' }}>Configurar Meta de Libertad Financiera</h3>
            
            <form onSubmit={handleSaveGoal} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>Edad Objetivo (Años):</label>
                <input type="number" value={editAge} onChange={e => setEditAge(e.target.value)} placeholder="Ej. 55" style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)', color: 'white' }} required />
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>Patrimonio Objetivo ($):</label>
                <input type="number" value={editAmount} onChange={e => setEditAmount(e.target.value)} placeholder="Ej. 10000000" step="100000" style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)', color: 'white' }} required />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button type="button" onClick={() => setShowGoalModal(false)} style={{ background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', padding: '0.65rem 1rem', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>Cancelar</button>
                <button type="submit" className="nav-tab-btn active" style={{ padding: '0.65rem 1.25rem' }}>Guardar Meta</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
