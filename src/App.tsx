import React, { useState, useEffect } from 'react';
import { Moon, Sun, MessageSquare, Send, Loader2, MapPin, Plus, X, Calendar, Map, Trash2, Lock, Unlock } from 'lucide-react';
import { format } from 'date-fns';
import { db } from './firebase';
import { collection, addDoc, onSnapshot, query, orderBy, doc, updateDoc, increment, deleteDoc, getDoc, setDoc } from "firebase/firestore";

interface IftarEvent {
  id: string;
  mosque_name: string;
  location: string;
  date?: string;
  description?: string;
  schedule_type: 'everyday' | 'specific_days';
  specific_days?: string[];
  true_votes: number;
  false_votes: number;
}

interface TimingInfo {
  time: string;
  date: string;
  readableDate: string;
}

interface TimingsState {
  sahri: TimingInfo | null;
  iftar: TimingInfo | null;
}

export default function App() {
  const [events, setEvents] = useState<IftarEvent[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newEvent, setNewEvent] = useState<{
    mosque_name: string;
    location: string;
    date: string;
    description: string;
    schedule_type: 'everyday' | 'specific_days';
    specific_days: string[];
  }>({
    mosque_name: '',
    location: '',
    date: '',
    description: '',
    schedule_type: 'everyday',
    specific_days: []
  });
  const [addingEvent, setAddingEvent] = useState(false);
  const [addEventError, setAddEventError] = useState<string | null>(null);
  const [timings, setTimings] = useState<TimingsState>({ sahri: null, iftar: null });
  const [loadingTimings, setLoadingTimings] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminPassword, setAdminPassword] = useState('admin123');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;
  const [userVotes, setUserVotes] = useState<Record<string, 'true' | 'false'>>({});

  const isFirebaseConfigured = !!(
    import.meta.env.VITE_FIREBASE_API_KEY &&
    import.meta.env.VITE_FIREBASE_PROJECT_ID &&
    import.meta.env.VITE_FIREBASE_APP_ID
  );

  useEffect(() => {
    // Health check to verify backend connectivity
    fetch('/api/health')
      .then(res => res.json())
      .then(data => console.log('Backend health check:', data))
      .catch(err => console.error('Backend health check failed:', err));

    if (!isFirebaseConfigured) {
      console.error("Firebase is not configured. Please set VITE_FIREBASE_* environment variables.");
      return;
    }

    // Real-time Firestore listener
    console.log("Initializing Firestore listener...");
    const q = query(collection(db, "iftar_events"), orderBy("created_at", "desc"));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      console.log("Firestore update received, docs count:", querySnapshot.size);
      const eventsData: IftarEvent[] = [];
      querySnapshot.forEach((doc) => {
        eventsData.push({ id: doc.id, ...doc.data() } as IftarEvent);
      });
      setEvents(eventsData);
    }, (error) => {
      console.error("Firestore subscription error:", error);
    });

    return () => unsubscribe();
  }, [isFirebaseConfigured]);

  useEffect(() => {
    // Load user votes from localStorage
    const savedVotes = localStorage.getItem('kushtia_iftar_votes');
    if (savedVotes) {
      try {
        setUserVotes(JSON.parse(savedVotes));
      } catch (e) {
        console.error('Failed to parse saved votes', e);
      }
    }
  }, []);

  useEffect(() => {
    // Save user votes to localStorage
    localStorage.setItem('kushtia_iftar_votes', JSON.stringify(userVotes));
  }, [userVotes]);

  useEffect(() => {
    const totalPages = Math.ceil(events.length / itemsPerPage);
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [events.length, currentPage]);

  useEffect(() => {
    const fetchAdminPassword = async () => {
      if (!isFirebaseConfigured) return;
      try {
        const settingsRef = doc(db, "settings", "admin_config");
        const settingsSnap = await getDoc(settingsRef);
        if (settingsSnap.exists()) {
          setAdminPassword(settingsSnap.data().password);
        } else {
          // Initialize with default if not exists
          await setDoc(settingsRef, { password: 'admin123' });
        }
      } catch (err) {
        console.error("Error fetching admin password:", err);
      }
    };
    fetchAdminPassword();
  }, [isFirebaseConfigured]);

  useEffect(() => {
    const fetchTimings = async () => {
      try {
        setLoadingTimings(true);
        
        // Fetch today and tomorrow
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        const formatDate = (d: Date) => {
          const day = String(d.getDate()).padStart(2, '0');
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const year = d.getFullYear();
          return `${day}-${month}-${year}`;
        };

        const [resToday, resTomorrow] = await Promise.all([
          fetch(`https://api.aladhan.com/v1/timingsByCity/${formatDate(today)}?city=Kushtia&country=Bangladesh&method=1`),
          fetch(`https://api.aladhan.com/v1/timingsByCity/${formatDate(tomorrow)}?city=Kushtia&country=Bangladesh&method=1`)
        ]);

        const dataToday = await resToday.json();
        const dataTomorrow = await resTomorrow.json();

        if (dataToday.code === 200 && dataTomorrow.code === 200) {
          const tToday = dataToday.data.timings;
          const tTomorrow = dataTomorrow.data.timings;
          const dToday = dataToday.data.date;
          const dTomorrow = dataTomorrow.data.date;

          const now = new Date();
          
          // Helper to parse "HH:mm" into a Date object for today
          const parseTime = (timeStr: string, baseDate: Date) => {
            const [hours, minutes] = timeStr.split(':').map(Number);
            const d = new Date(baseDate);
            d.setHours(hours, minutes, 0, 0);
            return d;
          };

          const sahriToday = parseTime(tToday.Fajr, today);
          const iftarToday = parseTime(tToday.Maghrib, today);

          const finalSahri = now > sahriToday 
            ? { time: tTomorrow.Fajr, date: dTomorrow.readable, readableDate: dTomorrow.readable }
            : { time: tToday.Fajr, date: dToday.readable, readableDate: dToday.readable };

          const finalIftar = now > iftarToday
            ? { time: tTomorrow.Maghrib, date: dTomorrow.readable, readableDate: dTomorrow.readable }
            : { time: tToday.Maghrib, date: dToday.readable, readableDate: dToday.readable };

          setTimings({
            sahri: finalSahri,
            iftar: finalIftar
          });
        }
      } catch (error) {
        console.error('Error fetching timings:', error);
      } finally {
        setLoadingTimings(false);
      }
    };

    fetchTimings();
    // Refresh every 5 minutes to check if we need to switch to next day
    const interval = setInterval(fetchTimings, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEvent.mosque_name || !newEvent.location) return;

    if (!isFirebaseConfigured) {
      setAddEventError("Firebase is not configured. Please add your Firebase keys in the Secrets panel.");
      return;
    }

    console.log("Attempting to add event to Firestore:", newEvent);
    setAddingEvent(true);
    setAddEventError(null);
    try {
      const eventData: any = {
        ...newEvent,
        true_votes: 0,
        false_votes: 0,
        created_at: new Date().toISOString()
      };
      
      // Remove empty optional fields if not provided
      if (!newEvent.date) {
        delete eventData.date;
      }
      if (!newEvent.description) {
        delete eventData.description;
      }

      const docRef = await addDoc(collection(db, "iftar_events"), eventData);
      
      console.log("Event added successfully with ID:", docRef.id);
      setIsModalOpen(false);
      setNewEvent({
        mosque_name: '',
        location: '',
        date: '',
        description: '',
        schedule_type: 'everyday',
        specific_days: []
      });
    } catch (err: any) {
      console.error('Failed to add event to Firebase', err);
      setAddEventError(`Firebase error: ${err.message || 'Check your Firebase configuration and security rules.'}`);
    } finally {
      console.log("Finishing add event process");
      setAddingEvent(false);
    }
  };

  const handleVote = async (id: string, type: 'true' | 'false') => {
    try {
      const eventRef = doc(db, "iftar_events", id);
      const currentVote = userVotes[id];

      if (currentVote === type) {
        // Withdraw vote if clicking the same button
        await updateDoc(eventRef, {
          [type === 'true' ? 'true_votes' : 'false_votes']: increment(-1)
        });
        const newUserVotes = { ...userVotes };
        delete newUserVotes[id];
        setUserVotes(newUserVotes);
      } else if (currentVote) {
        // Change vote if clicking the other button
        await updateDoc(eventRef, {
          [currentVote === 'true' ? 'true_votes' : 'false_votes']: increment(-1),
          [type === 'true' ? 'true_votes' : 'false_votes']: increment(1)
        });
        setUserVotes({ ...userVotes, [id]: type });
      } else {
        // New vote
        await updateDoc(eventRef, {
          [type === 'true' ? 'true_votes' : 'false_votes']: increment(1)
        });
        setUserVotes({ ...userVotes, [id]: type });
      }
    } catch (err) {
      console.error('Failed to vote in Firebase', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this mosque?')) return;
    try {
      await deleteDoc(doc(db, "iftar_events", id));
    } catch (err) {
      console.error('Failed to delete mosque', err);
      alert('Failed to delete mosque. Check permissions.');
    }
  };

  const toggleAdmin = () => {
    if (isAdmin) {
      setIsAdmin(false);
      console.log("Admin mode deactivated");
    } else {
      const pass = window.prompt('Enter Admin Password:');
      if (pass === adminPassword) {
        setIsAdmin(true);
        alert('Admin Login Successful!');
        console.log("Admin mode activated");
      } else if (pass !== null) {
        alert('Incorrect password!');
        console.log("Admin login failed: incorrect password");
      }
    }
  };

  const handleChangePassword = async () => {
    const newPass = window.prompt('Enter New Admin Password:');
    if (!newPass) return;
    
    const confirmPass = window.prompt('Confirm New Admin Password:');
    if (newPass !== confirmPass) {
      alert('Passwords do not match!');
      return;
    }

    try {
      const settingsRef = doc(db, "settings", "admin_config");
      await setDoc(settingsRef, { password: newPass });
      setAdminPassword(newPass);
      alert('Password changed successfully!');
    } catch (err) {
      console.error('Failed to change password', err);
      alert('Failed to change password. Check permissions.');
    }
  };

  const daysOfWeek = [
    { id: 'sat', label: 'Sat' },
    { id: 'sun', label: 'Sun' },
    { id: 'mon', label: 'Mon' },
    { id: 'tue', label: 'Tue' },
    { id: 'wed', label: 'Wed' },
    { id: 'thu', label: 'Thu' },
    { id: 'fri', label: 'Fri' },
  ];

  const toggleDay = (dayId: string) => {
    setNewEvent(prev => {
      const specific_days = prev.specific_days.includes(dayId)
        ? prev.specific_days.filter(d => d !== dayId)
        : [...prev.specific_days, dayId];
      return { ...prev, specific_days };
    });
  };

  const totalPages = Math.ceil(events.length / itemsPerPage);
  const currentEvents = events.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="min-h-screen text-slate-100 font-sans islamic-pattern">
      <header className="ramadan-hero shadow-2xl relative border-b border-white/10">
        {/* Decorative Elements */}
        <div className="absolute inset-0 pointer-events-none">
          {/* Small Stars */}
          <div className="star absolute top-[10%] left-[15%] w-0.5 h-0.5 bg-white rounded-full"></div>
          <div className="star-fast absolute top-[15%] left-[75%] w-0.5 h-0.5 bg-white rounded-full"></div>
          <div className="star-delayed absolute top-[60%] left-[10%] w-0.5 h-0.5 bg-white rounded-full"></div>
          <div className="star absolute top-[45%] left-[90%] w-0.5 h-0.5 bg-white rounded-full"></div>
          <div className="star-fast absolute top-[80%] left-[20%] w-0.5 h-0.5 bg-white rounded-full"></div>
          
          {/* Medium Stars */}
          <div className="star-delayed absolute top-[25%] left-[45%] w-1 h-1 bg-ramadan-gold rounded-full shadow-[0_0_5px_rgba(255,215,0,0.5)]"></div>
          <div className="star absolute top-[40%] left-[85%] w-1 h-1 bg-ramadan-gold rounded-full shadow-[0_0_5px_rgba(255,215,0,0.5)]"></div>
          <div className="star-fast absolute top-[70%] left-[60%] w-1 h-1 bg-white rounded-full shadow-[0_0_5px_rgba(255,255,255,0.5)]"></div>
          <div className="star-delayed absolute top-[15%] left-[30%] w-1 h-1 bg-white rounded-full shadow-[0_0_5px_rgba(255,255,255,0.5)]"></div>
          
          {/* Large Stars */}
          <div className="star absolute top-[20%] left-[65%] w-1.5 h-1.5 bg-ramadan-gold rounded-full shadow-[0_0_8px_rgba(255,215,0,0.8)]"></div>
          <div className="star-delayed absolute top-[55%] left-[35%] w-1.5 h-1.5 bg-white rounded-full shadow-[0_0_8px_rgba(255,255,255,0.8)]"></div>
        </div>
        
        <div className="css-moon"></div>
        
        {/* Mosque Minarets */}
        <div className="absolute bottom-0 left-0 w-full h-32 opacity-20 pointer-events-none flex items-end justify-between px-4 md:px-20 overflow-hidden">
          <div className="flex items-end space-x-4">
            <svg viewBox="0 0 100 200" className="w-8 h-24 md:w-12 md:h-32 fill-white">
              <path d="M50 0 L55 20 L45 20 Z M48 20 H52 V30 H48 Z M40 30 Q50 20 60 30 V100 H40 Z" />
              <rect x="35" y="100" width="30" height="100" />
            </svg>
            <svg viewBox="0 0 100 200" className="w-6 h-16 md:w-10 md:h-24 fill-white opacity-60">
              <path d="M50 0 L55 20 L45 20 Z M40 30 Q50 20 60 30 V100 H40 Z" />
              <rect x="35" y="100" width="30" height="100" />
            </svg>
          </div>
          <div className="flex items-end space-x-4">
            <svg viewBox="0 0 100 200" className="w-6 h-16 md:w-10 md:h-24 fill-white opacity-60">
              <path d="M50 0 L55 20 L45 20 Z M40 30 Q50 20 60 30 V100 H40 Z" />
              <rect x="35" y="100" width="30" height="100" />
            </svg>
            <svg viewBox="0 0 100 200" className="w-8 h-24 md:w-12 md:h-32 fill-white">
              <path d="M50 0 L55 20 L45 20 Z M48 20 H52 V30 H48 Z M40 30 Q50 20 60 30 V100 H40 Z" />
              <rect x="35" y="100" width="30" height="100" />
            </svg>
          </div>
        </div>
        
        <div className="lantern-wrapper left-[10%] hidden lg:block">
          <div className="css-lantern"></div>
        </div>
        <div className="lantern-wrapper right-[10%] hidden lg:block" style={{ animationDelay: '1s' }}>
          <div className="css-lantern"></div>
        </div>

        <div className="max-w-6xl mx-auto px-4 flex flex-col items-center relative z-10">
          <div className="hero-content text-center p-6 md:p-10 bg-black/20 backdrop-blur-sm rounded-[2rem] border border-white/10">
            <div className="text-4xl md:text-6xl mb-4 animate-bounce">🌙</div>
            <h1 className="text-3xl md:text-6xl font-black mb-3 tracking-tighter gold-glow text-ramadan-gold">
              Iftari Dibe
            </h1>
            <p className="text-white/90 text-sm md:text-xl font-medium tracking-wide">
              Sehri & Iftar times for your city
            </p>
            <div className="mt-6 flex items-center justify-center space-x-2 text-ramadan-gold/80 text-xs font-black uppercase tracking-widest">
              <MapPin size={14} />
              <span>Kushtia, Bangladesh</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {/* Timings Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm font-black text-ramadan-gold uppercase tracking-widest flex items-center space-x-2">
              <Calendar size={14} />
              <span>Prayer & Fasting Schedule</span>
            </h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="ramadan-card p-4 rounded-2xl flex flex-col space-y-3 border-l-4 border-l-ramadan-gold">
              <div className="flex items-center space-x-3">
                <div className="bg-ramadan-gold/20 p-2 rounded-lg border border-ramadan-gold/30">
                  <Sun className="text-ramadan-gold" size={20} />
                </div>
                <div>
                  <p className="text-[10px] font-black text-ramadan-gold/70 uppercase tracking-widest leading-none mb-1">Sahri Ends</p>
                  <p className="text-lg font-black text-white leading-none">
                    {loadingTimings ? '...' : timings.sahri ? format(new Date(`2000-01-01T${timings.sahri.time}`), 'h:mm a') : '--:--'}
                  </p>
                </div>
              </div>
              <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Date</span>
                <span className="text-[10px] font-black text-ramadan-gold bg-ramadan-gold/10 px-1.5 py-0.5 rounded border border-ramadan-gold/20">
                  {loadingTimings ? '...' : timings.sahri?.date || '--'}
                </span>
              </div>
            </div>
            
            <div className="ramadan-card p-4 rounded-2xl flex flex-col space-y-3 border-l-4 border-l-ramadan-emerald">
              <div className="flex items-center space-x-3">
                <div className="bg-ramadan-emerald/20 p-2 rounded-lg border border-ramadan-emerald/30">
                  <Moon className="text-ramadan-emerald" size={20} />
                </div>
                <div>
                  <p className="text-[10px] font-black text-ramadan-emerald/70 uppercase tracking-widest leading-none mb-1">Iftar Time</p>
                  <p className="text-lg font-black text-white leading-none">
                    {loadingTimings ? '...' : timings.iftar ? format(new Date(`2000-01-01T${timings.iftar.time}`), 'h:mm a') : '--:--'}
                  </p>
                </div>
              </div>
              <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Date</span>
                <span className="text-[10px] font-black text-ramadan-emerald bg-ramadan-emerald/10 px-1.5 py-0.5 rounded border border-ramadan-emerald/20">
                  {loadingTimings ? '...' : timings.iftar?.date || '--'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between ramadan-card p-5 rounded-3xl border border-white/10">
          <div className="flex items-center space-x-4">
            <div className="bg-ramadan-gold text-ramadan-deep w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xl shadow-lg shadow-ramadan-gold/20">
              {events.length}
            </div>
            <div>
              <p className="text-white font-black text-lg leading-none">Total Mosques</p>
              <p className="text-ramadan-gold/60 text-xs font-bold mt-1 uppercase tracking-wider">Registered in Kushtia</p>
            </div>
          </div>
          <div className="hidden sm:block">
            <div className="h-1.5 w-32 bg-white/5 rounded-full overflow-hidden border border-white/5">
              <div 
                className="h-full bg-ramadan-gold shadow-[0_0_10px_rgba(251,191,36,0.5)] transition-all duration-1000" 
                style={{ width: `${Math.min(events.length * 5, 100)}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* Iftar Events Section */}
        <section className="ramadan-card rounded-3xl overflow-hidden border border-white/10">
          <div className="bg-white/5 p-5 flex items-center justify-between border-b border-white/10">
            <div className="flex items-center space-x-3">
              <Calendar size={22} className="text-ramadan-gold" />
              <h2 className="font-black text-xl text-white tracking-tight">Mosque Iftar Schedule</h2>
              {isAdmin && (
                <span className="bg-ramadan-gold text-ramadan-deep text-[10px] px-2 py-0.5 rounded-full font-black uppercase tracking-tighter animate-pulse">
                  Admin
                </span>
              )}
            </div>
            <button
              onClick={() => setIsModalOpen(true)}
              className="text-sm bg-ramadan-gold hover:bg-ramadan-gold/90 text-ramadan-deep px-4 py-2 rounded-xl flex items-center space-x-2 transition-all font-black shadow-lg shadow-ramadan-gold/20 active:scale-95"
            >
              <Plus size={18} />
              <span>Add Mosque</span>
            </button>
          </div>
          
          <div className="p-6">
            {events.length === 0 ? (
              <div className="text-center py-16 space-y-4">
                <div className="bg-white/5 w-20 h-20 rounded-full flex items-center justify-center mx-auto border border-white/10">
                  <Map size={32} className="text-white/20" />
                </div>
                <div>
                  <p className="text-white/60 font-bold text-lg">No mosques added yet</p>
                  <p className="text-white/30 text-sm">Be the first to add an iftar schedule in Kushtia!</p>
                </div>
              </div>
            ) : (
              <div className="space-y-8">
                <div className="grid grid-cols-2 gap-3 md:gap-6 lg:grid-cols-3">
                  {currentEvents.map((event) => (
                    <div key={event.id} className="ramadan-card rounded-2xl p-3 md:p-5 hover:border-ramadan-gold/50 transition-all flex flex-col justify-between relative group border border-white/5">
                      {isAdmin && (
                        <button
                          onClick={() => handleDelete(event.id)}
                          className="absolute top-1.5 right-1.5 md:top-3 md:right-3 p-1 md:p-2 bg-rose-500/10 text-rose-400 rounded-lg md:rounded-xl hover:bg-rose-500/20 transition-colors border border-rose-500/20 z-10"
                          title="Delete Mosque"
                        >
                          <Trash2 size={14} className="md:w-[18px] md:h-[18px]" />
                        </button>
                      )}
                      <div>
                        <h3 className="font-black text-sm md:text-xl text-white mb-2 md:mb-3 pr-6 md:pr-10 tracking-tight">{event.mosque_name}</h3>
                        <div className="space-y-1.5 md:space-y-3 text-[10px] md:text-sm text-white/70 mb-3 md:mb-6">
                          <div className="flex items-center space-x-1.5 md:space-x-3">
                            <Map size={12} className="text-ramadan-gold/60 md:w-[18px] md:h-[18px]" />
                            <span className="font-medium">{event.location}</span>
                          </div>
                          {event.date && (
                            <div className="flex items-center space-x-1.5 md:space-x-3">
                              <Calendar size={12} className="text-ramadan-gold/60 md:w-[18px] md:h-[18px]" />
                              <span className="font-medium truncate">{format(new Date(event.date), 'MMM d, yy')}</span>
                            </div>
                          )}
                          <div className="flex items-center space-x-1.5 md:space-x-3">
                            <Calendar size={12} className="text-ramadan-gold/60 md:w-[18px] md:h-[18px]" />
                            <span className="font-bold text-ramadan-gold truncate">
                              {event.schedule_type === 'everyday' 
                                ? 'Everyday' 
                                : event.specific_days?.map(d => daysOfWeek.find(day => day.id === d)?.label).join(', ')}
                            </span>
                          </div>
                          {event.description && (
                            <div className="mt-2 md:mt-4 p-1.5 md:p-3 bg-white/5 rounded-lg md:rounded-xl border border-white/5 text-[9px] md:text-xs italic text-white/50 flex items-start space-x-1.5 md:space-x-3 leading-tight md:leading-relaxed">
                              <MessageSquare size={10} className="mt-0.5 flex-shrink-0 text-ramadan-gold/40 md:w-[14px] md:h-[14px]" />
                              <span className="">{event.description}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 md:pt-4 border-t border-white/5">
                        <div className="flex items-center space-x-1 md:space-x-2">
                          <button
                            onClick={() => handleVote(event.id, 'true')}
                            className={`flex items-center space-x-1 md:space-x-2 px-1.5 py-0.5 md:px-3 md:py-1.5 rounded-md md:rounded-lg transition-all border ${
                              userVotes[event.id] === 'true'
                                ? 'bg-emerald-500 text-white border-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                                : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/20'
                            }`}
                          >
                            <span className="text-[10px] md:text-sm">✔️</span>
                            <span className="font-black text-[9px] md:text-xs">{event.true_votes}</span>
                          </button>
                          <button
                            onClick={() => handleVote(event.id, 'false')}
                            className={`flex items-center space-x-1 md:space-x-2 px-1.5 py-0.5 md:px-3 md:py-1.5 rounded-md md:rounded-lg transition-all border ${
                              userVotes[event.id] === 'false'
                                ? 'bg-rose-500 text-white border-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.3)]'
                                : 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border-rose-500/20'
                            }`}
                          >
                            <span className="text-[10px] md:text-sm">❌</span>
                            <span className="font-black text-[9px] md:text-xs">{event.false_votes}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {totalPages > 1 && (
                  <div className="flex flex-col items-center space-y-4 pt-4">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1}
                        className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all font-bold text-xs uppercase tracking-widest"
                      >
                        Prev
                      </button>
                      
                      <div className="flex items-center space-x-1">
                        {[...Array(totalPages)].map((_, i) => (
                          <button
                            key={i + 1}
                            onClick={() => setCurrentPage(i + 1)}
                            className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black transition-all ${
                              currentPage === i + 1
                                ? 'bg-ramadan-gold text-ramadan-deep shadow-lg shadow-ramadan-gold/20'
                                : 'bg-white/5 text-white/40 border border-white/10 hover:bg-white/10'
                            }`}
                          >
                            {i + 1}
                          </button>
                        ))}
                      </div>

                      <button
                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                        disabled={currentPage === totalPages}
                        className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all font-bold text-xs uppercase tracking-widest"
                      >
                        Next
                      </button>
                    </div>
                    <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em]">
                      Page {currentPage} of {totalPages}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

      </main>

      <footer className="max-w-6xl mx-auto px-4 py-16 text-center space-y-6">
        <div className="h-px bg-white/5 w-full mb-8"></div>
        
        <button
          onClick={toggleAdmin}
          className={`inline-flex items-center justify-center w-10 h-10 rounded-full transition-all border ${
            isAdmin 
              ? 'bg-ramadan-gold text-ramadan-deep border-ramadan-gold shadow-lg shadow-ramadan-gold/20' 
              : 'bg-white/5 text-white/20 border-white/5 hover:bg-white/10 hover:text-white/40'
          }`}
          title={isAdmin ? 'Admin Mode Active' : 'Login'}
        >
          {isAdmin ? <Unlock size={16} /> : <Lock size={16} />}
        </button>

        {isAdmin && (
          <div className="flex justify-center">
            <button
              onClick={handleChangePassword}
              className="text-xs text-ramadan-gold font-black hover:underline flex items-center space-x-2 uppercase tracking-widest"
            >
              <span>Change Admin Password</span>
            </button>
          </div>
        )}

        <p className="text-white/30 text-xs font-bold uppercase tracking-[0.2em]">
          &copy; 2026 Iftari Dibe. All rights reserved.
        </p>
        <p className="text-white/20 text-[10px] uppercase tracking-widest">
          Developed by <span className="text-ramadan-gold/40 font-black">Al Hasib</span>
        </p>
      </footer>

      {/* Floating Action Button */}
      <button
        onClick={() => setIsModalOpen(true)}
        className="fixed bottom-8 right-8 bg-ramadan-gold text-ramadan-deep p-4 rounded-2xl shadow-2xl shadow-ramadan-gold/20 hover:scale-110 transition-all flex items-center justify-center z-40 border border-ramadan-gold/20 active:scale-95"
        title="Add Iftar Event"
      >
        <Plus size={28} />
      </button>

      {/* Add Event Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-ramadan-deep/80 flex items-center justify-center z-50 p-4 backdrop-blur-md">
          <div className="ramadan-card rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-white/10">
            <div className="flex items-center justify-between p-6 border-b border-white/5 bg-white/5">
              <h2 className="text-xl font-black text-white tracking-tight">Add Iftar Event</h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-white/40 hover:text-white transition-colors p-1"
              >
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleAddEvent} className="p-6 space-y-5">
              {!isFirebaseConfigured && (
                <div className="bg-amber-500/10 text-amber-400 p-4 rounded-2xl text-xs font-bold border border-amber-500/20">
                  ⚠️ Firebase is not configured. Please add your Firebase keys in the Secrets panel.
                </div>
              )}
              {addEventError && (
                <div className="bg-rose-500/10 text-rose-400 p-4 rounded-2xl text-xs font-bold border border-rose-500/20">
                  {addEventError}
                </div>
              )}
              <div>
                <label htmlFor="mosque_name" className="block text-[11px] font-black text-white/50 uppercase tracking-widest mb-2">
                  Mosque Name
                </label>
                <input
                  type="text"
                  id="mosque_name"
                  required
                  value={newEvent.mosque_name}
                  onChange={(e) => setNewEvent({ ...newEvent, mosque_name: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-ramadan-gold focus:border-ramadan-gold outline-none transition-all placeholder:text-white/20"
                  placeholder="e.g., Kushtia Central Mosque"
                />
              </div>
              
              <div>
                <label htmlFor="location" className="block text-[11px] font-black text-white/50 uppercase tracking-widest mb-2">
                  Location
                </label>
                <input
                  type="text"
                  id="location"
                  required
                  value={newEvent.location}
                  onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-ramadan-gold focus:border-ramadan-gold outline-none transition-all placeholder:text-white/20"
                  placeholder="e.g., NS Road, Kushtia"
                />
              </div>

              <div>
                <label htmlFor="date" className="block text-[11px] font-black text-white/50 uppercase tracking-widest mb-2">
                  Date (Optional)
                </label>
                <input
                  type="date"
                  id="date"
                  value={newEvent.date}
                  onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-ramadan-gold focus:border-ramadan-gold outline-none transition-all [color-scheme:dark]"
                />
              </div>

              <div>
                <label htmlFor="description" className="block text-[11px] font-black text-white/50 uppercase tracking-widest mb-2">
                  Iftar Description (Optional)
                </label>
                <textarea
                  id="description"
                  value={newEvent.description}
                  onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-ramadan-gold focus:border-ramadan-gold outline-none transition-all min-h-[100px] placeholder:text-white/20"
                  placeholder="e.g., খিচুড়ি, ডিম, খেজুর এবং শরবত দেওয়া হয়।"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black text-white/50 uppercase tracking-widest mb-3">
                  When is Iftar served?
                </label>
                <div className="flex space-x-6 mb-4">
                  <label className="flex items-center space-x-3 cursor-pointer group">
                    <input
                      type="radio"
                      name="schedule_type"
                      checked={newEvent.schedule_type === 'everyday'}
                      onChange={() => setNewEvent({ ...newEvent, schedule_type: 'everyday' })}
                      className="w-4 h-4 text-ramadan-gold bg-white/5 border-white/20 focus:ring-ramadan-gold focus:ring-offset-ramadan-deep"
                    />
                    <span className="text-sm font-bold text-white group-hover:text-ramadan-gold transition-colors">Everyday</span>
                  </label>
                  <label className="flex items-center space-x-3 cursor-pointer group">
                    <input
                      type="radio"
                      name="schedule_type"
                      checked={newEvent.schedule_type === 'specific_days'}
                      onChange={() => setNewEvent({ ...newEvent, schedule_type: 'specific_days' })}
                      className="w-4 h-4 text-ramadan-gold bg-white/5 border-white/20 focus:ring-ramadan-gold focus:ring-offset-ramadan-deep"
                    />
                    <span className="text-sm font-bold text-white group-hover:text-ramadan-gold transition-colors">Specific Days</span>
                  </label>
                </div>

                {newEvent.schedule_type === 'specific_days' && (
                  <div className="flex flex-wrap gap-2 p-4 bg-white/5 rounded-2xl border border-white/10">
                    {daysOfWeek.map((day) => (
                      <button
                        key={day.id}
                        type="button"
                        onClick={() => toggleDay(day.id)}
                        className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                          newEvent.specific_days.includes(day.id)
                            ? 'bg-ramadan-gold text-ramadan-deep shadow-lg shadow-ramadan-gold/20'
                            : 'bg-white/5 text-white/40 border border-white/10 hover:border-ramadan-gold/30'
                        }`}
                      >
                        {day.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="pt-6 flex justify-end space-x-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-6 py-3 text-white/50 font-bold hover:text-white transition-colors text-sm uppercase tracking-widest"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingEvent}
                  className="bg-ramadan-gold hover:bg-ramadan-gold/90 text-ramadan-deep px-8 py-3 rounded-xl font-black flex items-center justify-center space-x-2 disabled:opacity-50 transition-all shadow-lg shadow-ramadan-gold/20 active:scale-95 uppercase tracking-widest text-sm"
                >
                  {addingEvent ? <Loader2 size={20} className="animate-spin" /> : <span>Save Mosque</span>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
