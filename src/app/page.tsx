
"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation'; 
import { 
  scanFoodImage, 
  type ScanFoodImageInput, 
  type ScanFoodImageOutput 
} from '@/ai/flows/food-image-analyzer';
import {
  chatWithBot,
  type ChatInput as AIChatInput, 
  type ChatOutput as AIChatOutput, 
  type ChatMessage
} from '@/ai/flows/post-scan-chat';
import { useAuth, useFirestore, useUser, useCollection } from '@/firebase'; 
import { onAuthStateChanged, signOut, type User } from 'firebase/auth'; 
import { doc, getDoc, Timestamp, collection, addDoc, query, where, getDocs, onSnapshot, serverTimestamp, writeBatch, updateDoc } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  setDocumentNonBlocking,
  addDocumentNonBlocking,
  updateDocumentNonBlocking,
} from '@/firebase/non-blocking-updates';
import {
  initiateEmailSignIn,
  initiateEmailSignUp,
} from '@/firebase/non-blocking-login';

// date-fns for date calculations
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, format, isWithinInterval } from 'date-fns';
import { th } from 'date-fns/locale';

// Recharts for charts
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, CartesianGrid } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"

// ShadCN UI Components
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';


// Lucide Icons
import { Camera, Brain, AlertCircle, CheckCircle, Info, UserCircle, LogIn, UserPlus, LogOut, Loader2, Send, MessageCircle, ScanLine, Flame, Calculator, PlusCircle, BookCheck, Clock, CalendarDays, BarChart as BarChartIcon, Wheat, Sparkles, Trash2, AreaChart, PieChart, UploadCloud, Database } from 'lucide-react';

const UNIDENTIFIED_FOOD_MESSAGE = "ไม่สามารถระบุชนิดอาหารได้";

// Helper to get the start of the current day in UTC
const getStartOfUTCDay = () => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

interface UserProfile {
  height?: number;
  weight?: number;
  bmi?: number;
  dailyCalorieGoal?: number;
}

interface Meal {
  name: string;
  calories: number;
  timestamp: Timestamp;
  imageUrl?: string;
}

interface DailyLog {
  date: Timestamp;
  consumedCalories: number;
  meals: Meal[];
}

interface FoodItem {
  id: string;
  name: string;
  calories: number;
  imageUrl: string;
}


// A reviver function for JSON.parse to correctly handle Firestore Timestamps
const jsonReviver = (key: string, value: any) => {
  if (typeof value === 'object' && value !== null) {
    if (value.hasOwnProperty('seconds') && value.hasOwnProperty('nanoseconds')) {
      return new Timestamp(value.seconds, value.nanoseconds);
    }
    if (key === 'date' || key === 'timestamp') {
       if (typeof value === 'string' && value.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/)) {
        return Timestamp.fromDate(new Date(value));
      }
    }
  }
  return value;
};


const safeJsonParse = (item: string | null): any => {
  if (!item) return null;
  try {
    return JSON.parse(item, jsonReviver);
  } catch (e) {
    console.error("Failed to parse JSON from localStorage", e);
    return null;
  }
};


export default function FSFAPage() {
  const { toast } = useToast();
  const auth = useAuth();
  const db = useFirestore();
  const { user: currentUser, isUserLoading: isAuthLoading } = useUser();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageAnalysisResult, setImageAnalysisResult] = useState<ScanFoodImageOutput | null>(null);
  const [isLoadingImageAnalysis, setIsLoadingImageAnalysis] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  
  const [userProfile, setUserProfile] = useState<UserProfile>({});
  const [height, setHeight] = useState<string>('');
  const [weight, setWeight] = useState<string>('');
  const [isCalculatingBmi, setIsCalculatingBmi] = useState(false);

  const [dailyLog, setDailyLog] = useState<DailyLog | null>(null);
  const [dailyLogId, setDailyLogId] = useState<string | null>(null);
  const [isLoggingMeal, setIsLoggingMeal] = useState(false);

  // States for weekly and monthly summaries
  const [isWeeklyDialogOpen, setIsWeeklyDialogOpen] = useState(false);
  const [isMonthlyDialogOpen, setIsMonthlyDialogOpen] = useState(false);
  const [weeklyLogs, setWeeklyLogs] = useState<DailyLog[] | null>(null);
  const [monthlyLogs, setMonthlyLogs] = useState<DailyLog[] | null>(null);
  const [isWeeklyLoading, setIsWeeklyLoading] = useState(false);
  const [isMonthlyLoading, setIsMonthlyLoading] = useState(false);

  // States for food database modal
  const [isFoodDbOpen, setIsFoodDbOpen] = useState(false);
  const [databaseFoods, setDatabaseFoods] = useState<FoodItem[]>([]);
  const [isLoadingFoods, setIsLoadingFoods] = useState(false);
  const [foodSearchTerm, setFoodSearchTerm] = useState('');

  const [countdown, setCountdown] = useState<string>('');
  const [formattedToday, setFormattedToday] = useState<string>('');

  const isFoodIdentified = imageAnalysisResult && imageAnalysisResult.foodItem !== UNIDENTIFIED_FOOD_MESSAGE;

  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatScrollAreaRef = useRef<HTMLDivElement>(null);

  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [authDialogMode, setAuthDialogMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isAuthOpLoading, setIsAuthOpLoading] = useState(false);

  const resetState = useCallback(() => {
    setUserProfile({});
    setHeight('');
    setWeight('');
    setDailyLog(null);
    setDailyLogId(null);
  }, []);

  // --- NON-USER-SPECIFIC LOCALSTORAGE DATA ---
  useEffect(() => {
    const savedAnalysisResult = safeJsonParse(localStorage.getItem('imageAnalysisResult'));
    if (savedAnalysisResult) setImageAnalysisResult(savedAnalysisResult);
    
    const savedChatMessages = safeJsonParse(localStorage.getItem('chatMessages'));
    if (savedChatMessages) setChatMessages(savedChatMessages);

    const savedPreviewUrl = localStorage.getItem('previewUrl');
    if (savedPreviewUrl) setPreviewUrl(savedPreviewUrl);
  }, []);

  // Countdown Timer Effect
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      
      const nextReset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      nextReset.setUTCDate(nextReset.getUTCDate() + 1); // Set to midnight UTC of the next day

      const diff = nextReset.getTime() - now.getTime();

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setCountdown(`${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Set formatted date on client side to avoid hydration errors
  useEffect(() => {
    setFormattedToday(format(new Date(), 'd MMMM yyyy', { locale: th }));
  }, []);


  // --- AUTH & DATA MANAGEMENT ---
  useEffect(() => {
    if (isAuthLoading) {
        return;
    }

    let unsubscribeLog: (() => void) | undefined;

    const handleUserLoggedIn = async (user: User) => {
        if (!db) return;
        const localProfileData = safeJsonParse(localStorage.getItem('anonymousUserProfile'));
        const localLogsData: DailyLog[] = safeJsonParse(localStorage.getItem('anonymousDailyLogs')) || [];
        
        const userDocRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(userDocRef);

        let profileToSet: UserProfile = {};
        if (docSnap.exists()) {
            profileToSet = docSnap.data() as UserProfile;
        } else if (localProfileData && Object.keys(localProfileData).length > 0) {
            profileToSet = localProfileData;
            setDocumentNonBlocking(userDocRef, profileToSet, { merge: true });
        }
        
        if (localLogsData.length > 0) {
            const logsCollectionRef = collection(db, 'users', user.uid, 'dailyLogs');
            const batch = writeBatch(db);
            for (const log of localLogsData) {
                const newLogRef = doc(logsCollectionRef);
                batch.set(newLogRef, log);
            }
            await batch.commit();
            toast({ title: "ข้อมูลถูกย้ายแล้ว", description: "ข้อมูลทั้งหมดจากเซสชันที่ไม่ระบุตัวตนของคุณถูกบันทึกไปยังบัญชีใหม่ของคุณแล้ว" });
            localStorage.removeItem('anonymousUserProfile');
            localStorage.removeItem('anonymousDailyLogs');
            localStorage.removeItem('anonymousDailyLog'); // Clean up old key
        } else if (localProfileData && Object.keys(localProfileData).length > 0) {
             toast({ title: "ข้อมูลโปรไฟล์ถูกย้ายแล้ว", description: "ข้อมูลโปรไฟล์ของคุณถูกบันทึกไปยังบัญชีใหม่ของคุณแล้ว" });
             localStorage.removeItem('anonymousUserProfile');
        }
        
        setUserProfile(profileToSet);
        setHeight(String(profileToSet.height || ''));
        setWeight(String(profileToSet.weight || ''));
        
        const startOfTodayUTC = getStartOfUTCDay();
        const startOfTomorrowUTC = new Date(startOfTodayUTC);
        startOfTomorrowUTC.setUTCDate(startOfTomorrowUTC.getUTCDate() + 1);

        const logsCollection = collection(db, 'users', user.uid, 'dailyLogs');
        const q = query(
            logsCollection, 
            where('date', '>=', Timestamp.fromDate(startOfTodayUTC)),
            where('date', '<', Timestamp.fromDate(startOfTomorrowUTC))
        );
        
        unsubscribeLog = onSnapshot(q, (querySnapshot) => {
            if (!querySnapshot.empty) {
                const docSnap = querySnapshot.docs[0];
                setDailyLog(docSnap.data() as DailyLog);
                setDailyLogId(docSnap.id);
            } else {
               setDailyLog(null);
               setDailyLogId(null);
            }
        }, (error) => {
          console.error("[Log] Error listening to daily log:", error);
          toast({ title: "เกิดข้อผิดพลาด", description: "ไม่สามารถโหลดบันทึกแคลอรี่ได้", variant: "destructive" });
        });
    };

    const handleAnonymousUser = () => {
        if (unsubscribeLog) {
          unsubscribeLog();
          unsubscribeLog = undefined;
        }
        resetState();

        const localProfile = safeJsonParse(localStorage.getItem('anonymousUserProfile')) || {};
        setUserProfile(localProfile);
        setHeight(String(localProfile.height || ''));
        setWeight(String(localProfile.weight || ''));

        const allLogsRaw = localStorage.getItem('anonymousDailyLogs');
        let allLogs: DailyLog[] = safeJsonParse(allLogsRaw) || [];
        
        if (!allLogsRaw) { 
            const oldLog = safeJsonParse(localStorage.getItem('anonymousDailyLog'));
            if (oldLog) {
                allLogs = [oldLog]; 
                localStorage.setItem('anonymousDailyLogs', JSON.stringify(allLogs));
            }
        }
        localStorage.removeItem('anonymousDailyLog');
        
        const todayDateStr = format(getStartOfUTCDay(), 'yyyy-MM-dd');
        const todayLog = allLogs.find(log => format(log.date.toDate(), 'yyyy-MM-dd') === todayDateStr) || null;
        setDailyLog(todayLog);
    };
    
    if (currentUser) {
        handleUserLoggedIn(currentUser);
    } else {
        handleAnonymousUser();
    }
  
    return () => {
      if (unsubscribeLog) unsubscribeLog();
    };
  }, [currentUser, isAuthLoading, db, toast, resetState]);


    // Effect to fetch weekly logs when dialog opens
    useEffect(() => {
        const fetchWeeklyLogs = async () => {
            if (!db) return;
            setIsWeeklyLoading(true);
            
            if (currentUser) { // Logged-in user
                const today = new Date();
                const weekStart = startOfWeek(today, { weekStartsOn: 1 });
                const weekEnd = endOfWeek(today, { weekStartsOn: 1 });

                const logsCollectionRef = collection(db, 'users', currentUser.uid, 'dailyLogs');
                const q = query(
                    logsCollectionRef,
                    where('date', '>=', Timestamp.fromDate(weekStart)),
                    where('date', '<=', Timestamp.fromDate(weekEnd))
                );

                try {
                    const querySnapshot = await getDocs(q);
                    const logs = querySnapshot.docs.map(doc => doc.data() as DailyLog);
                    setWeeklyLogs(logs);
                } catch (error) {
                    console.error("Error fetching weekly logs:", error);
                    toast({ title: "เกิดข้อผิดพลาด", description: "ไม่สามารถโหลดข้อมูลรายสัปดาห์ได้", variant: "destructive" });
                    setWeeklyLogs([]);
                } finally {
                    setIsWeeklyLoading(false);
                }
            } else { // Anonymous user
                const today = new Date();
                const weekStart = startOfWeek(today, { weekStartsOn: 1 });
                const weekEnd = endOfWeek(today, { weekStartsOn: 1 });

                const allLogs: DailyLog[] = safeJsonParse(localStorage.getItem('anonymousDailyLogs')) || [];
                const logs = allLogs.filter(log => {
                    const logDate = log.date.toDate();
                    return isWithinInterval(logDate, { start: weekStart, end: weekEnd });
                });
                setWeeklyLogs(logs);
                setIsWeeklyLoading(false);
            }
        };

        if (isWeeklyDialogOpen) {
            fetchWeeklyLogs();
        }
    }, [isWeeklyDialogOpen, currentUser, db, toast]);

    // Effect to fetch monthly logs when dialog opens
    useEffect(() => {
        const fetchMonthlyLogs = async () => {
            if(!db) return;
            setIsMonthlyLoading(true);

            if (currentUser) { // Logged-in user
                const today = new Date();
                const monthStart = startOfMonth(today);
                const monthEnd = endOfMonth(today);

                const logsCollectionRef = collection(db, 'users', currentUser.uid, 'dailyLogs');
                const q = query(
                    logsCollectionRef,
                    where('date', '>=', Timestamp.fromDate(monthStart)),
                    where('date', '<=', Timestamp.fromDate(monthEnd))
                );

                try {
                    const querySnapshot = await getDocs(q);
                    const logs = querySnapshot.docs.map(doc => doc.data() as DailyLog);
                    setMonthlyLogs(logs);
                } catch (error) {
                    console.error("Error fetching monthly logs:", error);
                    toast({ title: "เกิดข้อผิดพลาด", description: "ไม่สามารถโหลดข้อมูลรายเดือนได้", variant: "destructive" });
                    setMonthlyLogs([]);
                } finally {
                    setIsMonthlyLoading(false);
                }
            } else { // Anonymous user
                const today = new Date();
                const monthStart = startOfMonth(today);
                const monthEnd = endOfMonth(today);
                
                const allLogs: DailyLog[] = safeJsonParse(localStorage.getItem('anonymousDailyLogs')) || [];
                const logs = allLogs.filter(log => {
                    const logDate = log.date.toDate();
                    return isWithinInterval(logDate, { start: monthStart, end: monthEnd });
                });
                setMonthlyLogs(logs);
                setIsMonthlyLoading(false);
            }
        };

        if (isMonthlyDialogOpen) {
            fetchMonthlyLogs();
        }
    }, [isMonthlyDialogOpen, currentUser, db, toast]);

    // Effect to fetch food database when dialog opens
    useEffect(() => {
        const fetchFoods = async () => {
            if (!db) return;
            setIsLoadingFoods(true);
            try {
                const foodsCollection = collection(db, 'food_items');
                const foodsSnapshot = await getDocs(foodsCollection);
                const foodsList = foodsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FoodItem));
                setDatabaseFoods(foodsList);
            } catch (error) {
                console.error("Error fetching food database:", error);
                toast({ title: "เกิดข้อผิดพลาด", description: "ไม่สามารถโหลดฐานข้อมูลอาหารได้", variant: "destructive" });
            } finally {
                setIsLoadingFoods(false);
            }
        };

        if (isFoodDbOpen) {
            fetchFoods();
        }
    }, [isFoodDbOpen, db, toast]);


  // --- DATA SAVING (Anonymous User) ---
  useEffect(() => {
    if (!currentUser && !isAuthLoading) {
      if (userProfile && Object.keys(userProfile).length > 0) {
          localStorage.setItem('anonymousUserProfile', JSON.stringify(userProfile));
      }
    }
  }, [userProfile, dailyLog, currentUser, isAuthLoading]);


  useEffect(() => {
    if (imageAnalysisResult) localStorage.setItem('imageAnalysisResult', JSON.stringify(imageAnalysisResult));
  }, [imageAnalysisResult]);
  
  useEffect(() => {
    if (chatMessages.length > 0) localStorage.setItem('chatMessages', JSON.stringify(chatMessages));
  }, [chatMessages]);

  useEffect(() => {
    if (previewUrl) localStorage.setItem('previewUrl', previewUrl);
  }, [previewUrl]);
  

  useEffect(() => {
    if (chatScrollAreaRef.current) {
      const scrollableViewport = chatScrollAreaRef.current.querySelector('div[data-radix-scroll-area-viewport]');
      if (scrollableViewport) {
        scrollableViewport.scrollTop = scrollableViewport.scrollHeight;
      }
    }
  }, [chatMessages]);

  
  const handleLogout = async () => {
    if (!auth) return;
    try {
      await signOut(auth);
      toast({
        title: "ออกจากระบบสำเร็จ",
        description: "ข้อมูลสำหรับเซสชันที่ไม่ล็อกอินของคุณจะถูกโหลด",
      });
    } catch (error: unknown) {
      console.error("Logout error:", error);
      toast({ title: "เกิดข้อผิดพลาดในการออกจากระบบ", variant: "destructive" });
    }
  };

  const resetImageRelatedStates = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setImageAnalysisResult(null);
    setImageError(null);
    localStorage.removeItem('previewUrl');
    localStorage.removeItem('imageAnalysisResult');
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      resetImageRelatedStates(); 
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleImageAnalysis = async () => {
    if (!selectedFile) {
      setImageError('โปรดเลือกไฟล์รูปภาพก่อน');
      return;
    }
    setIsLoadingImageAnalysis(true);
    setImageError(null);
    
    const reader = new FileReader();
    reader.readAsDataURL(selectedFile);
    reader.onload = async () => {
      const foodImage = reader.result as string;
      try {
        const result = await scanFoodImage({ foodImage } as ScanFoodImageInput);
        setImageAnalysisResult(result); 
        
        toast({
          title: "การวิเคราะห์เสร็จสมบูรณ์",
          description: result.foodItem === UNIDENTIFIED_FOOD_MESSAGE 
            ? "ไม่สามารถระบุรายการอาหารได้ โปรดลองภาพอื่น" 
            : `ระบุได้ว่าเป็น: ${result.foodItem}`,
        });
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'วิเคราะห์รูปภาพไม่สำเร็จ โปรดลองอีกครั้ง';
        setImageError(errorMessage);
        setImageAnalysisResult(null); 
        toast({
          title: "เกิดข้อผิดพลาดในการวิเคราะห์",
          description: errorMessage,
          variant: "destructive",
        });
      } finally {
        setIsLoadingImageAnalysis(false);
      }
    };
    reader.onerror = () => {
      setImageError('ไม่สามารถอ่านไฟล์รูปภาพที่เลือก');
      setIsLoadingImageAnalysis(false);
      setImageAnalysisResult(null); 
      toast({ title: "ข้อผิดพลาดในการอ่านไฟล์", variant: "destructive" });
    };
  };

  const handleChatSubmit = async (event?: React.FormEvent) => {
    if (event) event.preventDefault();
    const messageContent = chatInput.trim();
    if (!messageContent) return;

    const newUserMessage: ChatMessage = { role: 'user', content: messageContent };
    setChatMessages(prev => [...prev, newUserMessage]);
    setChatInput('');
    setIsChatLoading(true);

    try {
      const result: AIChatOutput = await chatWithBot({ message: messageContent, history: chatMessages.slice(-5) });
      const newBotMessage: ChatMessage = { role: 'model', content: result.response };
      setChatMessages(prev => [...prev, newBotMessage]);
    } catch (error) {
      console.error("Error in chatWithBot:", error);
      const errorMessage: ChatMessage = { role: 'model', content: "ขออภัยค่ะ มีปัญหาในการเชื่อมต่อกับ AI โปรดลองอีกครั้ง" };
      setChatMessages(prev => [...prev, errorMessage]);
      toast({ title: "Chatbot Error", variant: "destructive" });
    } finally {
      setIsChatLoading(false);
       if(chatInputRef.current) chatInputRef.current.focus();
    }
  };

  const handleCalculateBmi = () => {
    const h = parseFloat(height);
    const w = parseFloat(weight);

    if (isNaN(h) || isNaN(w) || h <= 0 || w <= 0) {
      toast({ title: "ข้อมูลไม่ถูกต้อง", description: "โปรดกรอกส่วนสูงและน้ำหนักให้ถูกต้อง", variant: "destructive"});
      return;
    }
    
    setIsCalculatingBmi(true);
    
    const bmi = w / ((h / 100) * (h / 100));
    const calorieGoal = (10 * w) + (6.25 * h) - (5 * 30) + 5; 
    const roundedCalorieGoal = Math.round(calorieGoal * 1.2); 

    const newProfile: UserProfile = {
        height: h,
        weight: w,
        bmi: parseFloat(bmi.toFixed(2)),
        dailyCalorieGoal: roundedCalorieGoal,
    };
    
    if (currentUser && db) {
        const userDocRef = doc(db, 'users', currentUser.uid);
        setDocumentNonBlocking(userDocRef, newProfile, { merge: true });
        setUserProfile(newProfile); // Optimistic update
        toast({ title: "คำนวณและบันทึกสำเร็จ", description: `BMI ของคุณคือ ${newProfile.bmi}` });
        setIsCalculatingBmi(false);
    } else {
        setUserProfile(newProfile);
        localStorage.setItem('anonymousUserProfile', JSON.stringify(newProfile));
        setIsCalculatingBmi(false);
        toast({ title: "คำนวณสำเร็จ", description: `BMI ของคุณคือ ${newProfile.bmi}` });
    }
  };

  const logMeal = async (mealToLog: Meal) => {
    if (!db) throw new Error("Firestore not available");
    
    const startOfTodayUTC = getStartOfUTCDay();

    if (currentUser) {
      const startOfTomorrowUTC = new Date(startOfTodayUTC);
      startOfTomorrowUTC.setUTCDate(startOfTomorrowUTC.getUTCDate() + 1);

      const logsCollectionRef = collection(db, 'users', currentUser.uid, 'dailyLogs');
      const logQuery = query(
          logsCollectionRef, 
          where('date', '>=', Timestamp.fromDate(startOfTodayUTC)),
          where('date', '<', Timestamp.fromDate(startOfTomorrowUTC))
      );
      
      const logSnapshot = await getDocs(logQuery);
      
      if (logSnapshot.empty) {
        const newLogData: DailyLog = {
          date: Timestamp.fromDate(startOfTodayUTC),
          consumedCalories: mealToLog.calories,
          meals: [mealToLog],
        };
        addDocumentNonBlocking(logsCollectionRef, newLogData);
      } else {
        const logDocRef = logSnapshot.docs[0].ref;
        const currentLogData = logSnapshot.docs[0].data() as DailyLog;
        const updatedMeals = [...currentLogData.meals, mealToLog];
        const updatedCalories = currentLogData.consumedCalories + mealToLog.calories;
        
        updateDocumentNonBlocking(logDocRef, {
          meals: updatedMeals,
          consumedCalories: updatedCalories
        });
      }
    } else { // Anonymous user
      const todayDateStr = format(startOfTodayUTC, 'yyyy-MM-dd');

      const allLogs: DailyLog[] = safeJsonParse(localStorage.getItem('anonymousDailyLogs')) || [];
      const todayLogIndex = allLogs.findIndex(log => format(log.date.toDate(), 'yyyy-MM-dd') === todayDateStr);

      let updatedLog: DailyLog;

      if (todayLogIndex > -1) {
          const currentLog = allLogs[todayLogIndex];
          updatedLog = {
              ...currentLog,
              consumedCalories: currentLog.consumedCalories + mealToLog.calories,
              meals: [...currentLog.meals, mealToLog],
          };
          allLogs[todayLogIndex] = updatedLog;
      } else {
          updatedLog = {
              date: Timestamp.fromDate(startOfTodayUTC),
              consumedCalories: mealToLog.calories,
              meals: [mealToLog],
          };
          allLogs.push(updatedLog);
      }
      
      setDailyLog(updatedLog);
      localStorage.setItem('anonymousDailyLogs', JSON.stringify(allLogs));
    }
  };

  const handleLogMeal = async () => {
    if (isLoggingMeal || !imageAnalysisResult || !imageAnalysisResult.nutritionalInformation) return;
    setIsLoggingMeal(true);
  
    const mealName = imageAnalysisResult.foodItem;
    const mealCalories = imageAnalysisResult.nutritionalInformation.estimatedCalories ?? 0;
  
    let imageUrl: string | undefined = undefined;

    try {
      if (currentUser && selectedFile) {
        const storage = getStorage();
        const filePath = `users/${currentUser.uid}/meals/${Date.now()}_${selectedFile.name}`;
        const storageRef = ref(storage, filePath);
        
        toast({ title: "กำลังอัปโหลดรูปภาพ...", description: "กรุณารอสักครู่" });
        const uploadResult = await uploadBytes(storageRef, selectedFile);
        imageUrl = await getDownloadURL(uploadResult.ref);
      }

      const newMeal: Meal = {
        name: mealName,
        calories: mealCalories,
        timestamp: Timestamp.now(),
        ...(imageUrl && { imageUrl }),
      };

      await logMeal(newMeal);
      toast({ title: "บันทึกมื้ออาหารสำเร็จ!" });

    } catch (error) {
      console.error("Error logging meal:", error);
      toast({ title: "เกิดข้อผิดพลาด", description: "ไม่สามารถบันทึกมื้ออาหารได้", variant: "destructive" });
    } finally {
      setIsLoggingMeal(false);
    }
  };

  const handleLogMealFromDatabase = async (food: FoodItem) => {
    if (isLoggingMeal) return;
    setIsLoggingMeal(true);

    try {
        const newMeal: Meal = {
            name: food.name,
            calories: food.calories,
            timestamp: Timestamp.now(),
            imageUrl: food.imageUrl,
        };

        await logMeal(newMeal);
        
        toast({ title: `เพิ่ม '${food.name}' สำเร็จ!`, description: "บันทึกมื้ออาหารของคุณแล้ว" });
        setIsFoodDbOpen(false); // Close dialog on success
    } catch (error) {
        console.error("Error logging meal from database:", error);
        toast({ title: "เกิดข้อผิดพลาด", description: "ไม่สามารถบันทึกมื้ออาหารได้", variant: "destructive" });
    } finally {
        setIsLoggingMeal(false);
    }
  };
  
  const getBmiInterpretation = (bmi: number | undefined): {text: string, color: string} => {
    if (bmi === undefined) return {text: 'N/A', color: 'text-muted-foreground'};
    if (bmi < 18.5) return { text: 'ผอม', color: 'text-blue-500' };
    if (bmi < 23) return { text: 'สมส่วน', color: 'text-green-500' };
    if (bmi < 25) return { text: 'ท้วม', color: 'text-yellow-500' };
    if (bmi < 30) return { text: 'อ้วนระดับ 1', color: 'text-orange-500' };
    return { text: 'อ้วนระดับ 2 (อันตราย)', color: 'text-red-500' };
  };

  const openAuthDialog = (mode: 'login' | 'register') => {
    setAuthDialogMode(mode);
    setAuthDialogOpen(true);
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setIsAuthOpLoading(false);
  };

  const handleAuthError = (error: any) => {
    console.error('Authentication error:', error);
    let errorMessage = "เกิดข้อผิดพลาดที่ไม่รู้จัก";
    switch (error.code) {
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        errorMessage = "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
        break;
      case 'auth/email-already-in-use':
        errorMessage = "อีเมลนี้ถูกใช้งานแล้ว";
        break;
      case 'auth/weak-password':
        errorMessage = "รหัสผ่านต้องมี 6 ตัวอักษรขึ้นไป";
        break;
      default:
        errorMessage = "การยืนยันตัวตนล้มเหลว โปรดลองอีกครั้ง";
    }
    toast({
      title: authDialogMode === 'login' ? "เข้าสู่ระบบไม่สำเร็จ" : "ลงทะเบียนไม่สำเร็จ",
      description: errorMessage,
      variant: "destructive"
    });
  };

  useEffect(() => {
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsAuthOpLoading(false);
      if (user) {
        toast({ title: "การยืนยันตัวตนสำเร็จ", description: "ยินดีต้อนรับ!" });
        setAuthDialogOpen(false);
      }
    }, (error) => {
      setIsAuthOpLoading(false);
      handleAuthError(error);
    });
    return () => unsubscribe();
  }, [auth, toast, authDialogMode]);

  const handleLogin = (event: React.FormEvent) => {
    event.preventDefault();
    if (!auth) return;
    if (!email || !password) {
      toast({ title: "ข้อมูลไม่ครบถ้วน", description: "โปรดกรอกอีเมลและรหัสผ่าน", variant: "destructive" });
      return;
    }
    setIsAuthOpLoading(true);
    initiateEmailSignIn(auth, email, password);
  };

  const handleRegister = (event: React.FormEvent) => {
    event.preventDefault();
    if (!auth) return;
    if (password !== confirmPassword) {
      toast({ title: "ลงทะเบียนไม่สำเร็จ", description: "รหัสผ่านไม่ตรงกัน", variant: "destructive" });
      return;
    }
    if (password.length < 6) {
      toast({ title: "ลงทะเบียนไม่สำเร็จ", description: "รหัสผ่านต้องมี 6 ตัวอักษรขึ้นไป", variant: "destructive" });
      return;
    }
    setIsAuthOpLoading(true);
    initiateEmailSignUp(auth, email, password);
  };

  const getMealPeriod = (date: Date): string => {
    const hour = date.getHours();
    if (hour >= 6 && hour < 9) return 'เช้า';
    if (hour >= 9 && hour < 12) return 'สาย';
    if (hour >= 12 && hour < 14) return 'เที่ยง';
    if (hour >= 14 && hour < 17) return 'บ่าย';
    if (hour >= 17 && hour < 20) return 'เย็น';
    if (hour >= 20 && hour < 23) return 'ค่ำ';
    return 'ดึก';
  };

  const groupedMeals = useMemo(() => {
    if (!dailyLog?.meals) return {};
    return dailyLog.meals.reduce((acc, meal) => {
      const mealDate = meal.timestamp.toDate();
      const period = getMealPeriod(mealDate);
      if (!acc[period]) {
          acc[period] = [];
      }
      acc[period].push(meal);
      acc[period].sort((a, b) => a.timestamp.seconds - b.timestamp.seconds);
      return acc;
    }, {} as Record<string, Meal[]>);
  }, [dailyLog]);

  const mealPeriodOrder = ['เช้า', 'สาย', 'เที่ยง', 'บ่าย', 'เย็น', 'ค่ำ', 'ดึก'];


  // Chart data and configs
    const chartConfig = {
        calories: { label: "แคลอรี่", color: "hsl(var(--chart-1))" },
    } satisfies ChartConfig;
    
    const weeklyChartData = useMemo(() => {
        if (!weeklyLogs) return [];
        const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
        const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });
        const daysInWeek = eachDayOfInterval({ start: weekStart, end: weekEnd });

        return daysInWeek.map(day => {
            const logForDay = weeklyLogs.find(log => format(log.date.toDate(), 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd'));
            return {
                name: format(day, 'E', { locale: th }),
                calories: logForDay ? logForDay.consumedCalories : 0,
            };
        });
    }, [weeklyLogs]);

    const monthlyChartData = useMemo(() => {
        if (!monthlyLogs) return [];
        const monthStart = startOfMonth(new Date());
        const monthEnd = endOfMonth(new Date());
        const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

        return daysInMonth.map(day => {
            const logForDay = monthlyLogs.find(log => format(log.date.toDate(), 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd'));
            return {
                name: format(day, 'd'),
                calories: logForDay ? logForDay.consumedCalories : 0,
            };
        });
    }, [monthlyLogs]);
    
    const weeklyTotalCalories = useMemo(() => weeklyLogs?.reduce((sum, log) => sum + log.consumedCalories, 0) || 0, [weeklyLogs]);
    const weeklyAverageCalories = useMemo(() => (weeklyLogs && weeklyLogs.length > 0) ? Math.round(weeklyTotalCalories / weeklyLogs.length) : 0, [weeklyLogs, weeklyTotalCalories]);
    
    const monthlyTotalCalories = useMemo(() => monthlyLogs?.reduce((sum, log) => sum + log.consumedCalories, 0) || 0, [monthlyLogs]);
    const monthlyAverageCalories = useMemo(() => (monthlyLogs && monthlyLogs.length > 0) ? Math.round(monthlyTotalCalories / monthlyLogs.length) : 0, [monthlyLogs, monthlyTotalCalories]);

    const calorieProgress = useMemo(() => {
      const goal = userProfile.dailyCalorieGoal;
      const consumed = dailyLog?.consumedCalories || 0;
      if (!goal || goal === 0) return 0;
      return Math.min((consumed / goal) * 100, 100); // Cap at 100% for UI
    }, [userProfile.dailyCalorieGoal, dailyLog?.consumedCalories]);

    const filteredFoods = useMemo(() => {
        if (!foodSearchTerm) return databaseFoods;
        return databaseFoods.filter(food => 
            food.name.toLowerCase().includes(foodSearchTerm.toLowerCase())
        );
    }, [databaseFoods, foodSearchTerm]);


  return (
    <div className="min-h-screen bg-background text-foreground font-body">
       <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur-sm">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
            <Link href="/" className="flex items-center gap-2">
                <ScanLine className="h-7 w-7 text-primary" />
                <span className="text-xl font-bold tracking-tight">MOMU SCAN</span>
            </Link>
          <div className="flex items-center space-x-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="rounded-full w-9 h-9">
                  <UserCircle className="w-5 h-5 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  {currentUser ? "บัญชีของฉัน" : "เข้าสู่ระบบ"}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {isAuthLoading ? (
                  <DropdownMenuItem disabled><Loader2 className="animate-spin mr-2"/>กำลังโหลด...</DropdownMenuItem>
                ) : currentUser ? (
                  <>
                    <DropdownMenuItem disabled>
                      <span className="truncate">{currentUser.email}</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>ออกจากระบบ</span>
                    </DropdownMenuItem>
                  </>
                ) : (
                  <>
                    <DropdownMenuItem onSelect={() => openAuthDialog('login')} className="cursor-pointer">
                        <LogIn className="mr-2 h-4 w-4" />
                        <span>เข้าสู่ระบบ</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => openAuthDialog('register')} className="cursor-pointer">
                        <UserPlus className="mr-2 h-4 w-4" />
                        <span>ลงทะเบียน</span>
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

       {/* Auth Dialog */}
      <Dialog open={authDialogOpen} onOpenChange={setAuthDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-center">
              {authDialogMode === 'login' ? 'เข้าสู่ระบบ' : 'สร้างบัญชีใหม่'}
            </DialogTitle>
            <DialogDescription className="text-center pt-2">
              {authDialogMode === 'login' ? 'ยินดีต้อนรับกลับสู่ MOMU SCAN!' : 'กรอกข้อมูลเพื่อเริ่มต้นใช้งาน'}
            </DialogDescription>
          </DialogHeader>
            <form onSubmit={authDialogMode === 'login' ? handleLogin : handleRegister} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="auth-email">อีเมล</Label>
                <Input id="auth-email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="auth-password">รหัสผ่าน</Label>
                <Input id="auth-password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              {authDialogMode === 'register' && (
                <div className="space-y-2">
                  <Label htmlFor="auth-confirmPassword">ยืนยันรหัสผ่าน</Label>
                  <Input id="auth-confirmPassword" type="password" placeholder="••••••••" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
                </div>
              )}
              <Button type="submit" className="w-full" size="lg" disabled={isAuthOpLoading}>
                {isAuthOpLoading ? <Loader2 className="animate-spin mr-2"/> : (authDialogMode === 'login' ? <LogIn className="mr-2 h-4 w-4" /> : <UserPlus className="mr-2 h-4 w-4" />) }
                {authDialogMode === 'login' ? 'เข้าสู่ระบบ' : 'สร้างบัญชี'}
              </Button>
            </form>
          <DialogFooter className="pt-4">
            <p className="text-sm text-muted-foreground text-center w-full">
              {authDialogMode === 'login' ? 'ยังไม่มีบัญชี?' : 'มีบัญชีอยู่แล้ว?'}
              <Button variant="link" onClick={() => setAuthDialogMode(authDialogMode === 'login' ? 'register' : 'login')} className="p-1">
                {authDialogMode === 'login' ? 'ลงทะเบียน' : 'เข้าสู่ระบบ'}
              </Button>
            </p>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Food DB Dialog */}
      <Dialog open={isFoodDbOpen} onOpenChange={setIsFoodDbOpen}>
        <DialogContent className="sm:max-w-lg">
            <DialogHeader>
                <DialogTitle>เลือกจากรายการอาหาร</DialogTitle>
                <DialogDescription>ค้นหาและเลือกอาหารจากฐานข้อมูลเพื่อบันทึกแคลอรี่อย่างรวดเร็ว</DialogDescription>
            </DialogHeader>
            <div className="pt-4">
                <Input
                    placeholder="ค้นหาชื่ออาหาร..."
                    value={foodSearchTerm}
                    onChange={(e) => setFoodSearchTerm(e.target.value)}
                    className="mb-4"
                />
                {isLoadingFoods ? (
                    <div className="flex justify-center items-center h-64">
                        <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    </div>
                ) : (
                    <ScrollArea className="h-96">
                        <div className="space-y-2 pr-4">
                            {filteredFoods.length > 0 ? filteredFoods.map(food => (
                                <Card key={food.id} className="flex items-center p-2">
                                    <div className="w-16 h-16 mr-4 relative rounded-md overflow-hidden flex-shrink-0 bg-muted">
                                        <Image src={food.imageUrl} alt={food.name} fill className="object-cover" data-ai-hint="food meal"/>
                                    </div>
                                    <div className="flex-grow">
                                        <p className="font-semibold">{food.name}</p>
                                        <p className="text-sm text-muted-foreground">{food.calories.toLocaleString()} kcal</p>
                                    </div>
                                    <Button size="sm" onClick={() => handleLogMealFromDatabase(food)} disabled={isLoggingMeal}>
                                        {isLoggingMeal ? <Loader2 className="w-4 h-4 animate-spin"/> : 'เพิ่ม'}
                                    </Button>
                                </Card>
                            )) : (
                                <p className="text-center text-muted-foreground pt-10">ไม่พบรายการอาหารที่ตรงกัน</p>
                            )}
                        </div>
                    </ScrollArea>
                )}
            </div>
        </DialogContent>
      </Dialog>


      <main className="container mx-auto grid grid-cols-1 gap-8 px-4 py-8 sm:px-6 lg:grid-cols-5 lg:px-8">
        <div className="lg:col-span-3 space-y-8">
            <Card>
                 <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-xl">
                        <Camera className="w-6 h-6 text-primary" />
                        AI วิเคราะห์อาหาร
                    </CardTitle>
                    <CardDescription>อัปโหลดรูปภาพอาหาร แล้ว AI จะประเมินข้อมูลโภชนาการให้คุณ</CardDescription>
                </CardHeader>
                <CardContent>
                  {!previewUrl ? (
                      <div className="relative">
                          <input
                            id="food-image-upload"
                            type="file"
                            className="hidden"
                            accept="image/*"
                            onChange={handleFileChange}
                          />
                          <Label
                            htmlFor="food-image-upload"
                            className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg cursor-pointer bg-muted/50 hover:bg-muted transition-colors"
                          >
                            <div className="flex flex-col items-center justify-center text-center pt-5 pb-6">
                              <UploadCloud className="w-10 h-10 mb-4 text-muted-foreground" />
                              <p className="mb-2 text-sm text-muted-foreground">
                                <span className="font-semibold text-primary">คลิกเพื่ออัปโหลด</span> หรือลากไฟล์มาวาง
                              </p>
                              <p className="text-xs text-muted-foreground">
                                PNG, JPG (สูงสุด 5MB)
                              </p>
                            </div>
                          </Label>
                      </div>
                  ) : (
                      <div className="relative group w-full aspect-video rounded-lg overflow-hidden border-2 border-dashed flex items-center justify-center bg-muted/50">
                          <Image src={previewUrl} alt="Food preview" fill className="object-contain p-2" data-ai-hint="food meal" />
                           <Button variant="destructive" size="icon" className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity" onClick={resetImageRelatedStates}>
                              <Trash2 className="w-4 h-4"/>
                              <span className="sr-only">ลบรูปภาพ</span>
                          </Button>
                      </div>
                  )}
                </CardContent>
                <CardFooter className="flex flex-col sm:flex-row gap-2">
                     <Button onClick={handleImageAnalysis} disabled={isLoadingImageAnalysis || !previewUrl} className="w-full" size="lg">
                        {isLoadingImageAnalysis ? (
                            <><Loader2 className="animate-spin mr-2 h-5 w-5" />กำลังวิเคราะห์...</>
                        ) : (
                            <> <Sparkles className="mr-2 h-5 w-5" /> วิเคราะห์รูปภาพ </>
                        )}
                    </Button>
                    <Button variant="secondary" className="w-full" size="lg" onClick={() => setIsFoodDbOpen(true)}>
                        <Database className="mr-2 h-5 w-5" /> เลือกจากรายการอาหาร
                    </Button>
                </CardFooter>
            </Card>

            {isLoadingImageAnalysis && (
                <Card>
                    <CardHeader>
                        <Skeleton className="h-7 w-48" />
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Skeleton className="h-5 w-3/4" />
                        <Skeleton className="h-20 w-full" />
                        <Skeleton className="h-16 w-full" />
                    </CardContent>
                </Card>
            )}

            {imageAnalysisResult && (
                <Card className="border-primary/50">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-3 text-xl">
                            {isFoodIdentified ? <CheckCircle className="w-6 h-6 text-accent" /> : <Info className="w-6 h-6 text-yellow-500" />}
                            ผลการวิเคราะห์
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <h3 className="font-semibold text-foreground">อาหารที่ระบุได้:</h3>
                            <div className="flex items-center gap-2 mt-1">
                                <p className="text-lg text-primary font-bold">{imageAnalysisResult.foodItem}</p>
                                {imageAnalysisResult.cuisineType && imageAnalysisResult.cuisineType !== 'ไม่สามารถระบุประเภทได้' && (
                                  <Badge variant="outline">{imageAnalysisResult.cuisineType}</Badge>
                                )}
                            </div>
                        </div>
                        
                        <>
                            <Separator />
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <h4 className="font-semibold text-foreground flex items-center gap-2 mb-2"><Flame className="w-5 h-5 text-orange-500" />แคลอรี่โดยประมาณ</h4>
                                    <p className="text-2xl font-bold">{(imageAnalysisResult.nutritionalInformation.estimatedCalories ?? 0) > 0 ? imageAnalysisResult.nutritionalInformation.estimatedCalories.toLocaleString() : 'N/A'} <span className="text-sm font-normal text-muted-foreground">kcal</span></p>
                                    {imageAnalysisResult.nutritionalInformation.reasoning && <p className="text-xs text-muted-foreground mt-1">{imageAnalysisResult.nutritionalInformation.reasoning}</p>}
                                </div>
                                {imageAnalysisResult.nutritionalInformation.visibleIngredients && imageAnalysisResult.nutritionalInformation.visibleIngredients.length > 0 && (
                                    <div>
                                        <h4 className="font-semibold text-foreground flex items-center gap-2 mb-2"><Wheat className="w-5 h-5 text-yellow-600" />ส่วนผสมที่พบ</h4>
                                        <div className="flex flex-wrap gap-2">
                                            {imageAnalysisResult.nutritionalInformation.visibleIngredients.map((ingredient, index) => (
                                                <Badge key={index} variant="secondary">{ingredient}</Badge>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </>
                    </CardContent>
                    {isFoodIdentified && (
                        <CardFooter>
                             <Button size="lg" onClick={handleLogMeal} disabled={isLoggingMeal || (imageAnalysisResult.nutritionalInformation.estimatedCalories ?? 0) <= 0} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
                                {isLoggingMeal ? <Loader2 className="animate-spin mr-2" /> : <PlusCircle className="mr-2"/>}
                                เพิ่มในบันทึกแคลอรี่
                            </Button>
                        </CardFooter>
                    )}
                </Card>
            )}

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-xl">
                        <MessageCircle className="w-6 h-6 text-primary" />
                        Momu AI Assistant
                    </CardTitle>
                    <CardDescription>สอบถามเกี่ยวกับอาหาร โภชนาการ หรือข้อสงสัยอื่นๆ</CardDescription>              
                </CardHeader>
                <CardContent>
                    <ScrollArea className="h-72 w-full rounded-lg border bg-muted/30 p-4" viewportRef={chatScrollAreaRef}>
                        {chatMessages.length === 0 && (
                            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                                <Brain className="w-12 h-12 mb-4"/>
                                <p className="text-lg font-medium">เริ่มต้นการสนทนา</p>
                                <p className="text-sm">ถามคำถามเกี่ยวกับอาหารที่สแกนได้เลย!</p>
                            </div>
                        )}
                        <div className="space-y-4">
                        {chatMessages.map((msg, index) => (
                            <div key={index} className={`flex items-end gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                {msg.role === 'model' && <UserCircle className="w-6 h-6 text-primary flex-shrink-0"/>}
                                <div className={`p-3 rounded-lg max-w-[85%] shadow-sm ${ msg.role === 'user' ? 'bg-primary text-primary-foreground rounded-br-none' : 'bg-secondary text-secondary-foreground rounded-bl-none'}`}>
                                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                                </div>
                            </div>
                        ))}
                        </div>
                        {isChatLoading && (
                            <div className="flex items-end gap-2 justify-start mt-4">
                                <UserCircle className="w-6 h-6 text-primary flex-shrink-0"/>
                                <div className="p-3 rounded-lg bg-secondary text-secondary-foreground rounded-bl-none shadow-sm">
                                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                                </div>
                            </div>
                        )}
                    </ScrollArea>
                </CardContent>
                <CardFooter>
                     <form onSubmit={handleChatSubmit} className="flex w-full items-center space-x-2">
                        <Textarea ref={chatInputRef} value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="พิมพ์ข้อความของคุณ..." className="flex-grow resize-none" rows={1} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatSubmit(); } }} />
                        <Button type="submit" size="icon" className="flex-shrink-0" disabled={isChatLoading || !chatInput.trim()}>
                            <Send className="h-4 w-4" />
                            <span className="sr-only">Send</span>
                        </Button>
                    </form>
                </CardFooter>
            </Card>
        </div>

        <div className="lg:col-span-2 space-y-8">
            <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xl"><Calculator className="w-6 h-6 text-primary"/>โปรไฟล์และ BMI</CardTitle>
                  <CardDescription>คำนวณดัชนีมวลกายและเป้าหมายแคลอรี่ของคุณ</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="height">ส่วนสูง (ซม.)</Label>
                    <Input id="height" type="number" placeholder="เช่น 165" value={height} onChange={(e) => setHeight(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="weight">น้ำหนัก (กก.)</Label>
                    <Input id="weight" type="number" placeholder="เช่น 55" value={weight} onChange={(e) => setWeight(e.target.value)} />
                  </div>
                   <Button onClick={handleCalculateBmi} disabled={isCalculatingBmi} className="w-full">
                     {isCalculatingBmi ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Calculator className="mr-2 h-4 w-4" />}
                     คำนวณและบันทึก
                   </Button>
                </CardContent>
                {userProfile.bmi && (
                  <CardFooter className="flex flex-col items-start space-y-4 pt-4 border-t">
                     <div className="w-full">
                      <h4 className="font-semibold text-muted-foreground">ดัชนีมวลกาย (BMI)</h4>
                      <p className={`text-3xl font-bold ${getBmiInterpretation(userProfile.bmi).color}`}>{userProfile.bmi} <span className="text-lg font-normal">({getBmiInterpretation(userProfile.bmi).text})</span></p>
                     </div>
                  </CardFooter>
                )}
            </Card>

           <Card>
            <CardHeader>
                <div className="flex justify-between items-center">
                    <CardTitle className="text-xl">ภาพรวมวันนี้</CardTitle>
                     <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => setIsWeeklyDialogOpen(true)}><AreaChart className="h-4 w-4 lg:mr-2"/> <span className="hidden lg:inline">สัปดาห์</span></Button>
                        <Button variant="outline" size="sm" onClick={() => setIsMonthlyDialogOpen(true)}><BarChartIcon className="h-4 w-4 lg:mr-2"/> <span className="hidden lg:inline">เดือน</span></Button>
                    </div>
                </div>
                <CardDescription>{formattedToday || <Skeleton className="h-5 w-32" />}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div>
                  <div className="flex justify-between items-baseline mb-1">
                    <span className="text-sm text-muted-foreground">แคลอรี่ที่บริโภค</span>
                    <span className="text-sm text-muted-foreground">เป้าหมาย: {userProfile.dailyCalorieGoal?.toLocaleString() || 'N/A'} kcal</span>
                  </div>
                  <Progress value={calorieProgress} className="h-3" />
                  <div className="flex justify-between items-baseline mt-1">
                     <span className={`text-lg font-bold ${(dailyLog?.consumedCalories ?? 0) > (userProfile.dailyCalorieGoal ?? 9999) ? 'text-destructive' : 'text-accent'}`}>{dailyLog?.consumedCalories.toLocaleString() ?? 0} kcal</span>
                     <span className="text-sm font-semibold text-muted-foreground">{Math.round(calorieProgress)}%</span>
                  </div>
                </div>
                
                <Separator/>

                 <div>
                    <h3 className="text-md font-semibold mb-3">มื้อที่บันทึกแล้ว</h3>
                    {dailyLog && dailyLog.meals.length > 0 ? (
                        <Accordion type="single" collapsible className="w-full" defaultValue={mealPeriodOrder.find(p => groupedMeals[p]) ? `period-${mealPeriodOrder.find(p => groupedMeals[p])}`: undefined}>
                            {mealPeriodOrder.map(period => (
                                groupedMeals[period] && (
                                <AccordionItem value={`period-${period}`} key={period}>
                                    <AccordionTrigger className="py-2">
                                        <div className="flex justify-between w-full pr-4 items-center">
                                            <span className="font-semibold">{period}</span>
                                            <span className="text-sm text-muted-foreground">{groupedMeals[period].reduce((sum, meal) => sum + meal.calories, 0).toLocaleString()} kcal</span>
                                        </div>
                                    </AccordionTrigger>
                                    <AccordionContent className="pt-2">
                                        <div className="pl-2 space-y-3 border-l-2 border-primary/50 ml-2">
                                            {groupedMeals[period].map((meal, index) => (
                                                <div key={index} className="flex justify-between items-center text-sm text-muted-foreground pl-4">
                                                    {meal.imageUrl && (
                                                      <div className="w-12 h-12 mr-4 relative rounded-md overflow-hidden flex-shrink-0">
                                                          <Image src={meal.imageUrl} alt={meal.name} fill className="object-cover" data-ai-hint="food meal" />
                                                      </div>
                                                    )}
                                                    <div className="flex-grow truncate pr-2">
                                                        <p className="font-medium text-foreground truncate">{meal.name}</p>
                                                        <p className="text-xs">{meal.timestamp.toDate().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.</p>
                                                    </div>
                                                    <span className="font-medium whitespace-nowrap text-foreground/90">{meal.calories.toLocaleString()} kcal</span>
                                                </div>
                                            ))}
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                                )
                            ))}
                        </Accordion>
                    ) : (
                        <div className="text-center text-muted-foreground py-10">
                            <p>ยังไม่มีการบันทึกมื้ออาหารสำหรับวันนี้</p>
                        </div>
                    )}
                 </div>
            </CardContent>
            <CardFooter className="flex items-center justify-center">
                 <p className="text-xs text-muted-foreground flex items-center justify-center">
                    <Clock className="mr-1.5 h-3 w-3" />
                    รีเซ็ตข้อมูลในอีก: <span className="font-semibold ml-1 tabular-nums">{countdown}</span>
                </p>
            </CardFooter>
           </Card>

            <Dialog open={isWeeklyDialogOpen} onOpenChange={setIsWeeklyDialogOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>ภาพรวมแคลอรี่สัปดาห์นี้</DialogTitle>
                        <DialogDescription>กราฟแสดงผลแคลอรี่ที่คุณบริโภคในสัปดาห์นี้</DialogDescription>
                    </DialogHeader>
                    {isWeeklyLoading ? (
                        <div className="py-8 flex justify-center"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div>
                    ) : weeklyLogs && weeklyLogs.length > 0 ? (
                        <div className="py-4 space-y-4">
                            <ChartContainer config={chartConfig} className="min-h-[250px] w-full">
                                <BarChart accessibilityLayer data={weeklyChartData}>
                                    <CartesianGrid vertical={false} />
                                    <XAxis dataKey="name" tickLine={false} tickMargin={10} axisLine={false} stroke="hsl(var(--muted-foreground))" />
                                    <YAxis stroke="hsl(var(--muted-foreground))" />
                                    <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
                                    <Bar dataKey="calories" fill="var(--color-calories)" radius={8} />
                                </BarChart>
                            </ChartContainer>
                                <div className="grid grid-cols-2 gap-4 text-center">
                                <Card className="p-4">
                                    <CardHeader className="p-0 pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">แคลอรี่รวม</CardTitle></CardHeader>
                                    <CardContent className="p-0"><p className="text-2xl font-bold">{weeklyTotalCalories.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">kcal</span></p></CardContent>
                                </Card>
                                <Card className="p-4">
                                    <CardHeader className="p-0 pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">เฉลี่ยต่อวัน</CardTitle></CardHeader>
                                    <CardContent className="p-0"><p className="text-2xl font-bold">{weeklyAverageCalories.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">kcal</span></p></CardContent>
                                </Card>
                            </div>
                        </div>
                    ) : (
                        <p className="py-8 text-center text-muted-foreground">ยังไม่มีข้อมูลสำหรับสัปดาห์นี้</p>
                    )}
                </DialogContent>
            </Dialog>

            <Dialog open={isMonthlyDialogOpen} onOpenChange={setIsMonthlyDialogOpen}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>ภาพรวมแคลอรี่เดือนนี้</DialogTitle>
                        <DialogDescription>กราฟแสดงผลแคลอรี่ที่คุณบริโภคในเดือนนี้ ({format(new Date(), 'MMMM yyyy', { locale: th })})</DialogDescription>
                    </DialogHeader>
                    {isMonthlyLoading ? (
                        <div className="py-8 flex justify-center"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div>
                    ) : monthlyLogs && monthlyLogs.length > 0 ? (
                        <div className="py-4 space-y-4">
                            <ChartContainer config={chartConfig} className="min-h-[250px] w-full h-80">
                                <BarChart accessibilityLayer data={monthlyChartData}>
                                    <CartesianGrid vertical={false} />
                                    <XAxis dataKey="name" tickLine={false} tickMargin={10} axisLine={false} stroke="hsl(var(--muted-foreground))" fontSize={10} />
                                    <YAxis stroke="hsl(var(--muted-foreground))" />
                                    <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
                                    <Bar dataKey="calories" fill="var(--color-calories)" radius={4} />
                                </BarChart>
                            </ChartContainer>
                                <div className="grid grid-cols-2 gap-4 text-center">
                                <Card className="p-4">
                                    <CardHeader className="p-0 pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">แคลอรี่รวม</CardTitle></CardHeader>
                                    <CardContent className="p-0"><p className="text-2xl font-bold">{monthlyTotalCalories.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">kcal</span></p></CardContent>
                                </Card>
                                <Card className="p-4">
                                    <CardHeader className="p-0 pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">เฉลี่ยต่อวัน (ที่มีข้อมูล)</CardTitle></CardHeader>
                                    <CardContent className="p-0"><p className="text-2xl font-bold">{monthlyAverageCalories.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">kcal</span></p></CardContent>
                                </Card>
                            </div>
                        </div>
                    ) : (
                        <p className="py-8 text-center text-muted-foreground">ยังไม่มีข้อมูลสำหรับเดือนนี้</p>
                    )}
                </DialogContent>
            </Dialog>

        </div>
      </main>

      <footer className="text-center py-8 mt-8 border-t">
        <p className="text-sm text-muted-foreground">MOMU SCAN - Created with Firebase Studio</p>
      </footer>
    </div>
  );
}

    