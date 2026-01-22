import React, { useState, useEffect, useRef } from 'react';
import ReactPlayer from 'react-player/youtube';
import { 
  Play, Pause, Check, RotateCcw, BookOpen, Trophy, Flame, 
  Calendar, BarChart2, Star, ChevronRight, X, Volume2, 
  Search, ArrowRight, Settings, Loader2, Home, User, AlertCircle
} from 'lucide-react';

// --- 환경 변수 및 상수 ---
// Railway 배포 시 환경 변수로 백엔드 주소를 설정해야 합니다.
// 예: VITE_API_URL=https://your-backend-app.railway.app
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/**
 * --- UI COMPONENTS ---
 */
const Button = ({ children, onClick, variant = 'primary', className = '', size = 'md', disabled = false, icon: Icon }) => {
  const baseStyle = "font-bold rounded-2xl transition-all active:scale-95 border-b-4 active:border-b-0 flex items-center justify-center gap-2";
  
  const variants = {
    primary: "bg-green-500 text-white border-green-700 hover:bg-green-400 disabled:bg-slate-300 disabled:border-slate-400 disabled:text-slate-500",
    secondary: "bg-white text-slate-700 border-slate-200 hover:bg-slate-50",
    danger: "bg-red-500 text-white border-red-700 hover:bg-red-400",
    outline: "bg-transparent text-slate-400 border-2 border-slate-200 hover:border-slate-300 border-b-2 active:border-b-2"
  };

  const sizes = {
    sm: "py-2 px-4 text-sm",
    md: "py-3 px-6 text-base",
    lg: "py-4 px-8 text-xl w-full"
  };

  return (
    <button 
      onClick={onClick} 
      disabled={disabled}
      className={`${baseStyle} ${variants[variant]} ${sizes[size]} ${className} ${disabled ? 'cursor-not-allowed transform-none border-b-0' : ''}`}
    >
      {Icon && <Icon size={20} />}
      {children}
    </button>
  );
};

const ProgressBar = ({ current, total, color = "bg-green-500" }) => {
  const percentage = Math.min(100, (current / total) * 100);
  return (
    <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
      <div 
        className={`h-full ${color} transition-all duration-500 ease-out rounded-full relative`}
        style={{ width: `${percentage}%` }}
      >
        <div className="absolute top-1 left-2 w-full h-0.5 bg-white opacity-20 rounded-full"></div>
      </div>
    </div>
  );
};

const Card = ({ children, className = '', onClick }) => (
  <div onClick={onClick} className={`bg-white rounded-2xl border-2 border-slate-200 shadow-sm ${className}`}>
    {children}
  </div>
);

const OptionChip = ({ label, selected, onClick }) => (
  <div 
    onClick={onClick} 
    className={`
      cursor-pointer py-3 px-4 rounded-xl border-2 font-bold text-center transition-all
      ${selected 
        ? 'border-green-500 bg-green-50 text-green-600 shadow-sm' 
        : 'border-slate-100 bg-white text-slate-400 hover:border-slate-200 hover:text-slate-500'}
    `}
  >
    {label}
  </div>
);

/**
 * --- MAIN APPLICATION ---
 */
export default function TubeLingoApp() {
  // Navigation State
  const [view, setView] = useState('home'); 
  const [activeTab, setActiveTab] = useState('study'); 

  // Data State
  const [urlInput, setUrlInput] = useState('');
  const [activeData, setActiveData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  // User Progress State
  const [userStats, setUserStats] = useState({
    xp: 1250,
    streak: 12,
    todayXp: 40,
    goalXp: 100,
    savedWords: []
  });

  // Player State
  const [playing, setPlaying] = useState(false);
  const [currentScriptIdx, setCurrentScriptIdx] = useState(0);
  const playerRef = useRef(null);

  // Quiz State
  const [quizConfig, setQuizConfig] = useState({ count: 5, difficulty: 'normal' });
  const [quizSession, setQuizSession] = useState([]);
  const [currentQIdx, setCurrentQIdx] = useState(0);
  const [selectedOpt, setSelectedOpt] = useState(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [score, setScore] = useState(0);

  // --- API HANDLERS ---

  const handleUrlSubmit = async () => {
    if (!urlInput) return;
    
    setIsLoading(true);
    setErrorMsg('');
    setView('analyzing');

    try {
      const response = await fetch(`${API_BASE_URL}/api/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: urlInput }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || '분석에 실패했습니다.');
      }

      const data = await response.json();
      
      // 데이터 정규화 및 상태 저장
      setActiveData({
        ...data,
        thumbnail: `https://img.youtube.com/vi/${data.videoId}/mqdefault.jpg`
      });
      
      setView('study');
      setPlaying(true);
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message);
      setView('home'); // 에러 발생 시 홈으로 복귀
    } finally {
      setIsLoading(false);
    }
  };

  const handleSeek = (seconds, index) => {
    if (playerRef.current) {
      playerRef.current.seekTo(seconds, 'seconds');
      setPlaying(true);
      setCurrentScriptIdx(index);
    }
  };

  const saveWord = (wordObj) => {
    if (!userStats.savedWords.find(w => w.word === wordObj.word)) {
      setUserStats(prev => ({
        ...prev,
        savedWords: [...prev.savedWords, { ...wordObj, date: new Date().toLocaleDateString() }]
      }));
    }
  };

  const startQuizSetup = () => {
    setPlaying(false);
    setView('quiz_setup');
  };

  const generateQuiz = () => {
    // 백엔드에서 받아온 quizBank를 활용해 퀴즈 세션 생성
    if (!activeData?.quizBank || activeData.quizBank.length === 0) {
      alert("생성된 퀴즈 데이터가 없습니다.");
      return;
    }

    // 난이도 필터링 (간이 로직: 실제로는 더 복잡할 수 있음)
    // 데이터가 부족하면 그냥 모든 문제를 섞어서 사용
    let questions = activeData.quizBank.filter(q => q.difficulty === quizConfig.difficulty);
    if (questions.length === 0) questions = activeData.quizBank;
    
    // 부족하면 랜덤 복제 (데모용)
    while (questions.length < quizConfig.count) {
       questions.push(questions[Math.floor(Math.random() * questions.length)]);
    }
    
    // 셔플 및 개수 자르기
    const sessionQuestions = questions
      .sort(() => Math.random() - 0.5)
      .slice(0, quizConfig.count)
      .map((q, i) => ({ ...q, id: i })); // 고유 ID 부여

    setQuizSession(sessionQuestions);
    setCurrentQIdx(0);
    setScore(0);
    setSelectedOpt(null);
    setIsAnswered(false);
    setView('quiz');
  };

  const checkAnswer = () => {
    const currentQ = quizSession[currentQIdx];
    const correct = currentQ.answer === selectedOpt;
    setIsCorrect(correct);
    setIsAnswered(true);
    if (correct) setScore(s => s + 1);
  };

  const nextQuestion = () => {
    if (currentQIdx < quizSession.length - 1) {
      setCurrentQIdx(p => p + 1);
      setSelectedOpt(null);
      setIsAnswered(false);
    } else {
      finishQuiz();
    }
  };

  const finishQuiz = () => {
    const gainedXp = score * 10 + 20; 
    setUserStats(prev => ({
      ...prev,
      xp: prev.xp + gainedXp,
      todayXp: prev.todayXp + gainedXp
    }));
    setView('result');
  };

  // --- VIEWS ---

  const Header = () => (
    <header className="h-14 bg-white border-b-2 border-slate-100 flex items-center justify-between px-4 sticky top-0 z-50">
      <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView('home')}>
        <div className="bg-green-500 rounded-lg w-8 h-8 flex items-center justify-center text-white font-bold">T</div>
        <span className="font-extrabold text-green-500 text-lg tracking-tight hidden sm:block">TubeLingo</span>
      </div>
      <div className="flex gap-4 text-sm font-bold">
        <div className="flex items-center gap-1 text-orange-500">
          <Flame size={18} fill="currentColor" /> {userStats.streak}
        </div>
        <div className="flex items-center gap-1 text-yellow-500">
          <Trophy size={18} fill="currentColor" /> {userStats.xp}
        </div>
      </div>
    </header>
  );

  const HomeView = () => (
    <div className="p-6 max-w-lg mx-auto flex flex-col items-center justify-center min-h-[80vh]">
      <div className="mb-8 relative">
        <div className="absolute inset-0 bg-green-200 rounded-full blur-xl opacity-50"></div>
        <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" alt="Mascot" className="w-40 h-40 relative z-10" />
      </div>
      <h1 className="text-3xl font-extrabold text-slate-700 text-center mb-4">
        유튜브로 배우는<br/>가장 재미있는 방법
      </h1>
      
      {errorMsg && (
        <div className="w-full bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl mb-4 flex items-center gap-2 text-sm font-bold">
          <AlertCircle size={18} />
          {errorMsg}
        </div>
      )}

      <p className="text-slate-400 text-center mb-8">
        좋아하는 영상 링크만 넣으세요.<br/>AI 튜터가 학습 자료와 퀴즈를 만들어줍니다!
      </p>
      
      <div className="w-full bg-white p-2 rounded-2xl border-2 border-slate-200 shadow-sm flex mb-4">
        <input 
          type="text"
          placeholder="https://youtu.be/..."
          className="flex-1 p-3 outline-none text-slate-700 font-medium"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          disabled={isLoading}
        />
      </div>
      <Button size="lg" onClick={handleUrlSubmit} disabled={!urlInput || isLoading} className="w-full">
        {isLoading ? <Loader2 className="animate-spin" /> : '학습 시작하기'}
      </Button>

      <div className="mt-8 text-center text-xs text-slate-300">
        Powered by OpenAI & YouTube API
      </div>
    </div>
  );

  const AnalyzingView = () => (
    <div className="flex flex-col items-center justify-center h-[80vh]">
      <Loader2 size={64} className="text-green-500 animate-spin mb-6" />
      <h2 className="text-2xl font-bold text-slate-700 mb-2">AI가 영상을 분석하고 있어요</h2>
      <p className="text-slate-400 mb-8">잠시만 기다려주세요 (약 10~20초 소요)</p>
      
      <div className="w-64 space-y-2">
        <div className="flex justify-between text-xs font-bold text-slate-400">
          <span>스크립트 추출 중...</span>
          <span className="text-green-500">Processing</span>
        </div>
        <ProgressBar current={isLoading ? 60 : 100} total={100} />
      </div>
    </div>
  );

  const StudyView = () => (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="w-full aspect-video bg-black sticky top-0 z-40">
        <ReactPlayer
          ref={playerRef}
          url={`https://www.youtube.com/watch?v=${activeData.videoId}`}
          width="100%"
          height="100%"
          playing={playing}
          controls
          onProgress={({ playedSeconds }) => {
            if (!activeData.script) return;
            const idx = activeData.script.findIndex(line => line.time > playedSeconds);
            if (idx !== -1 && idx - 1 !== currentScriptIdx) {
              setCurrentScriptIdx(Math.max(0, idx - 1));
            }
          }}
        />
      </div>

      <div className="flex bg-white border-b border-slate-200">
        <button 
          onClick={() => setActiveTab('study')}
          className={`flex-1 py-3 font-bold text-sm ${activeTab === 'study' ? 'text-green-500 border-b-2 border-green-500' : 'text-slate-400'}`}
        >
          스크립트
        </button>
        <button 
          onClick={() => setActiveTab('words')}
          className={`flex-1 py-3 font-bold text-sm ${activeTab === 'words' ? 'text-green-500 border-b-2 border-green-500' : 'text-slate-400'}`}
        >
          단어장 ({activeData.vocabulary?.length || 0})
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-24 scroll-smooth">
        {activeTab === 'study' ? (
          <div className="space-y-4">
            {activeData.script?.map((line, idx) => (
              <div 
                key={idx} 
                onClick={() => handleSeek(line.time, idx)}
                className={`p-4 rounded-xl cursor-pointer transition-all border-2 ${
                  currentScriptIdx === idx 
                    ? 'bg-white border-green-400 shadow-md transform scale-[1.02]' 
                    : 'bg-white border-transparent hover:border-slate-100'
                }`}
              >
                <div className="flex gap-3">
                  <div className="mt-1">
                    {currentScriptIdx === idx 
                      ? <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center"><Volume2 size={14} className="text-white animate-pulse"/></div>
                      : <div className="w-6 h-6 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 text-xs font-bold">{Math.floor(line.time)}s</div>
                    }
                  </div>
                  <div>
                    <p className={`text-lg mb-1 font-medium leading-relaxed ${currentScriptIdx === idx ? 'text-slate-800' : 'text-slate-500'}`}>
                      {line.text}
                    </p>
                    <p className="text-sm text-slate-400">{line.kr}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {activeData.vocabulary?.map((v, i) => (
              <div key={i} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-lg text-slate-700">{v.word}</span>
                    <span className="text-xs font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{v.type}</span>
                  </div>
                  <div className="text-slate-500">{v.meaning}</div>
                </div>
                <button 
                  onClick={() => saveWord(v)}
                  className={`p-2 rounded-full ${userStats.savedWords.find(w => w.word === v.word) ? 'text-yellow-400 bg-yellow-50' : 'text-slate-300 hover:bg-slate-50'}`}
                >
                  <Star fill="currentColor" size={24} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 w-full p-4 bg-white border-t border-slate-100 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] z-50">
        <Button size="lg" onClick={startQuizSetup} className="w-full shadow-lg shadow-green-200">
          학습 완료 & 퀴즈 도전!
        </Button>
      </div>
    </div>
  );

  // --- (나머지 뷰들은 Mock 버전과 로직이 동일하여 UI 렌더링 코드 유지) ---
  const QuizSetupView = () => (
    <div className="p-6 max-w-md mx-auto h-full flex flex-col">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => setView('study')} className="text-slate-400 hover:bg-slate-100 p-2 rounded-full"><X /></button>
        <ProgressBar current={0} total={100} />
      </div>
      <h2 className="text-2xl font-extrabold text-slate-700 mb-8">퀴즈 옵션 설정</h2>
      <div className="mb-8">
        <label className="text-sm font-bold text-slate-400 uppercase mb-4 block">문항 수</label>
        <div className="grid grid-cols-3 gap-3">
          {[3, 5, 10].map(num => (
            <OptionChip key={num} label={`${num}문제`} selected={quizConfig.count === num} onClick={() => setQuizConfig({...quizConfig, count: num})} />
          ))}
        </div>
      </div>
      <div className="mb-8">
        <label className="text-sm font-bold text-slate-400 uppercase mb-4 block">난이도</label>
        <div className="grid grid-cols-3 gap-3">
          {['easy', 'normal', 'hard'].map(lv => (
            <OptionChip key={lv} label={lv.toUpperCase()} selected={quizConfig.difficulty === lv} onClick={() => setQuizConfig({...quizConfig, difficulty: lv})} />
          ))}
        </div>
      </div>
      <div className="mt-auto">
        <Button size="lg" onClick={generateQuiz} className="w-full">퀴즈 생성하기 ✨</Button>
      </div>
    </div>
  );

  const QuizView = () => {
    const question = quizSession[currentQIdx];
    if (!question) return <div>문제 로딩 실패</div>;
    const progress = ((currentQIdx + 1) / quizSession.length) * 100;

    return (
      <div className="p-6 max-w-md mx-auto h-full flex flex-col">
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => setView('study')} className="text-slate-400"><X /></button>
          <ProgressBar current={progress} total={100} />
          <div className="text-green-600 font-bold">{currentQIdx + 1}/{quizSession.length}</div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <h2 className="text-xl font-bold text-slate-700 mb-6 leading-snug">{question.question}</h2>
          <div className="space-y-3">
            {question.options.map((opt, idx) => {
              let stateStyle = "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"; 
              if (isAnswered) {
                if (idx === question.answer) stateStyle = "bg-green-100 border-green-500 text-green-700";
                else if (idx === selectedOpt) stateStyle = "bg-red-100 border-red-500 text-red-700 opacity-60";
                else stateStyle = "bg-slate-50 border-slate-100 text-slate-300";
              } else if (selectedOpt === idx) {
                stateStyle = "bg-blue-50 border-blue-500 text-blue-600";
              }
              return (
                <div key={idx} onClick={() => !isAnswered && setSelectedOpt(idx)} className={`p-4 rounded-xl border-2 font-medium cursor-pointer transition-all ${stateStyle}`}>
                  <div className="flex items-center justify-between">
                    {opt}
                    {isAnswered && idx === question.answer && <Check className="text-green-600"/>}
                    {isAnswered && idx === selectedOpt && idx !== question.answer && <X className="text-red-500"/>}
                  </div>
                </div>
              );
            })}
          </div>
          {isAnswered && (
            <div className="mt-6 animate-in slide-in-from-bottom-4 fade-in duration-300">
              <div className={`p-4 rounded-xl border-2 ${isCorrect ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                <div className="flex items-center gap-2 mb-2 font-bold">
                  {isCorrect ? <span className="text-green-600">정답입니다! 🎉</span> : <span className="text-red-500">오답입니다 😢</span>}
                </div>
                <p className="text-sm text-slate-600 font-medium leading-relaxed">
                  <span className="font-bold text-slate-700">해설:</span> {question.rationale}
                </p>
              </div>
            </div>
          )}
        </div>
        <div className="mt-4 pt-4 border-t border-slate-100">
          {!isAnswered ? (
            <Button size="lg" onClick={checkAnswer} disabled={selectedOpt === null} className="w-full">확인하기</Button>
          ) : (
            <Button size="lg" variant={isCorrect ? 'primary' : 'secondary'} onClick={nextQuestion} className="w-full">
              {currentQIdx < quizSession.length - 1 ? '다음 문제' : '결과 보기'}
            </Button>
          )}
        </div>
      </div>
    );
  };

  const ResultView = () => (
    <div className="flex flex-col items-center justify-center h-full p-6 text-center animate-in zoom-in duration-300 max-w-md mx-auto">
      <div className="mb-6 relative">
        <div className="absolute inset-0 bg-yellow-200 rounded-full animate-ping opacity-50"></div>
        <Trophy size={80} className="text-yellow-500 relative z-10 drop-shadow-xl" fill="currentColor" />
      </div>
      <h2 className="text-3xl font-extrabold text-slate-700 mb-2">Quiz Completed!</h2>
      <p className="text-slate-500 text-lg mb-8">오늘의 학습 목표를 달성했습니다.</p>
      <div className="grid grid-cols-2 gap-4 w-full mb-8">
        <Card className="p-4 bg-yellow-50 border-yellow-200">
          <div className="text-yellow-600 font-bold text-xs uppercase">Total XP</div>
          <div className="text-2xl font-extrabold text-yellow-700">+{score * 10 + 20}</div>
        </Card>
        <Card className="p-4 bg-blue-50 border-blue-200">
          <div className="text-blue-600 font-bold text-xs uppercase">Accuracy</div>
          <div className="text-2xl font-extrabold text-blue-700">{Math.round((score / quizConfig.count) * 100)}%</div>
        </Card>
      </div>
      <div className="space-y-3 w-full">
        <Button size="lg" onClick={() => setView('dashboard')} className="w-full">대시보드 확인</Button>
        <Button size="lg" variant="secondary" onClick={() => setView('home')} className="w-full">홈으로 돌아가기</Button>
      </div>
    </div>
  );

  const DashboardView = () => (
    <div className="p-6 pb-24">
      <h2 className="text-2xl font-extrabold text-slate-700 mb-6">내 학습 리포트</h2>
      <Card className="p-6 mb-6">
        <div className="flex justify-between items-center mb-6">
          <h3 className="font-bold text-slate-700">주간 활동</h3>
          <span className="text-sm font-bold text-slate-400">총 4시간 20분</span>
        </div>
        <div className="flex justify-between items-end h-32 gap-2">
          {[40, 70, 30, 85, 50, 100, userStats.todayXp].map((val, i) => (
            <div key={i} className="flex flex-col items-center flex-1 group">
              <div className={`w-full rounded-t-lg transition-all duration-500 group-hover:opacity-80 ${i===6 ? 'bg-green-500' : 'bg-slate-200'}`} style={{ height: `${(val/150)*100}%` }}></div>
              <span className="text-xs font-bold text-slate-400 mt-2">{['월','화','수','목','금','토','일'][i]}</span>
            </div>
          ))}
        </div>
      </Card>
      <h3 className="font-bold text-slate-700 text-lg mb-4">내 단어장 ({userStats.savedWords.length})</h3>
      {userStats.savedWords.length === 0 ? (
        <div className="text-center p-8 bg-slate-50 rounded-2xl border-dashed border-2 border-slate-200">
          <BookOpen className="mx-auto text-slate-300 mb-2" />
          <p className="text-slate-400 text-sm">학습 중에 단어를 저장해보세요!</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {userStats.savedWords.map((w, i) => (
            <div key={i} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center">
              <div>
                <span className="font-bold text-slate-700 mr-2">{w.word}</span>
                <span className="text-sm text-slate-500">{w.meaning}</span>
              </div>
              <span className="text-xs font-bold text-slate-300 bg-slate-50 px-2 py-1 rounded">{w.date}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="flex justify-center bg-slate-100 min-h-screen font-sans text-slate-900">
      <div className="w-full max-w-md bg-white shadow-2xl flex flex-col relative h-screen max-h-screen overflow-hidden">
        {['home', 'dashboard', 'study'].includes(view) && <Header />}
        <main className="flex-1 overflow-y-auto scrollbar-hide">
          {view === 'home' && <HomeView />}
          {view === 'analyzing' && <AnalyzingView />}
          {view === 'study' && <StudyView />}
          {view === 'quiz_setup' && <QuizSetupView />}
          {view === 'quiz' && <QuizView />}
          {view === 'result' && <ResultView />}
          {view === 'dashboard' && <DashboardView />}
        </main>
        {['home', 'dashboard'].includes(view) && (
          <nav className="border-t border-slate-100 bg-white grid grid-cols-2 p-2 pb-6">
            <button onClick={() => setView('home')} className={`p-3 rounded-xl flex flex-col items-center gap-1 transition-all ${view === 'home' ? 'text-green-500' : 'text-slate-400 hover:bg-slate-50'}`}>
              <Home size={24} strokeWidth={view === 'home' ? 3 : 2} />
              <span className="text-xs font-bold">학습</span>
            </button>
            <button onClick={() => setView('dashboard')} className={`p-3 rounded-xl flex flex-col items-center gap-1 transition-all ${view === 'dashboard' ? 'text-green-500' : 'text-slate-400 hover:bg-slate-50'}`}>
              <User size={24} strokeWidth={view === 'dashboard' ? 3 : 2} />
              <span className="text-xs font-bold">내 정보</span>
            </button>
          </nav>
        )}
      </div>
    </div>
  );
}
