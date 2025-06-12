
"use client";

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
// Removed: import { useRouter } from 'next/navigation'; 
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
import { auth, db, serverTimestamp } from '@/lib/firebase'; 
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut, type User } from 'firebase/auth'; // Added auth functions
import { collection, addDoc, query, where, getDocs, orderBy, Timestamp as FirestoreTimestamp, doc, deleteDoc, writeBatch } from 'firebase/firestore';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';


// ShadCN UI Components
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  DialogTrigger, // Added DialogTrigger
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';


// Lucide Icons
import { UploadCloud, Brain, Utensils, AlertCircle, CheckCircle, Info, UserCircle, LogIn, UserPlus, LogOut, ListChecks, Loader2, Heart, ChefHat, Settings, MessageSquareWarning, Send, MessageCircle, Trash2 } from 'lucide-react';

const UNIDENTIFIED_FOOD_MESSAGE = "ไม่สามารถระบุชนิดอาหารได้";
const GENERIC_NUTRITION_UNAVAILABLE = "ไม่สามารถระบุข้อมูลทางโภชนาการได้";
const GENERIC_SAFETY_UNAVAILABLE = "ไม่มีคำแนะนำด้านความปลอดภัยเฉพาะสำหรับรายการนี้";
const LOCAL_STORAGE_LIKED_MEALS_KEY = 'fsfa-likedMealNames';

const PageSection: React.FC<{title: string; icon: React.ReactNode; children: React.ReactNode; id: string; className?: string; titleBgColor?: string; titleTextColor?: string;}> = ({ title, icon, children, id, className, titleBgColor = "bg-primary", titleTextColor = "text-primary-foreground" }) => (
  <section id={id} className={`py-6 sm:py-8 md:py-12 ${className || ''}`}>
    <div className="container mx-auto px-4">
      <h2 className={`text-xl sm:text-2xl md:text-3xl font-headline font-semibold text-center mb-4 sm:mb-6 md:mb-8 ${titleTextColor} ${titleBgColor} py-2 sm:py-3 rounded-lg shadow-md`}>
        {React.cloneElement(icon as React.ReactElement, { className: "inline-block w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 mr-2 sm:mr-3" })}
        {title}
      </h2>
      {children}
    </div>
  </section>
);
PageSection.displayName = 'PageSection';

interface LikedMealItem {
  name: string;
  id?: string; 
  likedAt?: FirestoreTimestamp | Date; 
}

export default function FSFAPage() {
  const { toast } = useToast();
  // Removed: const router = useRouter(); 

  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageAnalysisResult, setImageAnalysisResult] = useState<ScanFoodImageOutput | null>(null);
  const [isLoadingImageAnalysis, setIsLoadingImageAnalysis] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  
  const [isLiking, setIsLiking] = useState(false); 
  const [isCurrentFoodLiked, setIsCurrentFoodLiked] = useState(false); 
  
  const [isMyMealsDialogOpen, setIsMyMealsDialogOpen] = useState(false);
  const [likedMealsList, setLikedMealsList] = useState<LikedMealItem[]>([]); 
  const [isLoadingMyMeals, setIsLoadingMyMeals] = useState(false);
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const [isClearingMeals, setIsClearingMeals] = useState(false);


  const isFoodIdentified = imageAnalysisResult && imageAnalysisResult.foodItem !== UNIDENTIFIED_FOOD_MESSAGE;

  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatScrollAreaRef = useRef<HTMLDivElement>(null);

  // State for Login and Register Dialogs
  const [isLoginDialogOpen, setIsLoginDialogOpen] = useState(false);
  const [isRegisterDialogOpen, setIsRegisterDialogOpen] = useState(false);


  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      console.log('[Auth Effect] Auth state changed. User object (stringified):', JSON.stringify(user));
      console.log('[Auth Effect] User UID:', user?.uid || 'Anonymous');
      setCurrentUser(user);
      if (user) { // Close dialogs if user logs in/registers
        setIsLoginDialogOpen(false);
        setIsRegisterDialogOpen(false);
      }
    });
    return () => {
      console.log('[Auth Effect] Unsubscribing auth listener.');
      unsubscribeAuth();
    } 
  }, []);
  
  const loadUserLikedMealNames = async () => {
    const localUserId = currentUser?.uid;
    console.log('[My Meals Load Effect] currentUser object at start of loadUserLikedMealNames:', JSON.stringify(currentUser));
    console.log(`[My Meals Load Effect] Attempting to load liked meal names. User ID from currentUser.uid: '${localUserId || 'Anonymous'}' (Type: ${typeof localUserId})`);
  
    if (!localUserId || typeof localUserId !== 'string' || localUserId.trim() === '') {
      console.warn(`[My Meals Load Effect] User ID is invalid or empty ('${localUserId}'). Will attempt to load from localStorage if available, but Firestore operations for this user will be skipped.`);
    }
  
    setIsLoadingMyMeals(true);
    let fetchedMealItems: LikedMealItem[] = [];
  
    if (localUserId && typeof localUserId === 'string' && localUserId.trim() !== '') {
      console.log(`[My Meals Load Effect] User ID '${localUserId}' is valid and non-empty. Fetching from Firestore.`);
      try {
        const firestorePath = `users/${localUserId}/likedMealNames`;
        console.log(`[My Meals Load Effect] Firestore path to be used: ${firestorePath}`);
        const likedMealNamesRef = collection(db, firestorePath);
        const q = query(likedMealNamesRef, orderBy('likedAt', 'desc'));
        
        console.log('[My Meals Load Effect] Executing Firestore query...');
        const querySnapshot = await getDocs(q);
        console.log('[My Meals Load Effect] Firestore query executed. Docs count:', querySnapshot.docs.length);
        
        fetchedMealItems = querySnapshot.docs.map(doc => ({
          id: doc.id,
          name: doc.data().foodName as string,
          likedAt: doc.data().likedAt, 
        }));
        console.log('[My Meals Load Effect] Fetched and mapped meals from Firestore:', fetchedMealItems.map(i => i.name));
      } catch (error: any) {
        console.error("[My Meals Load Effect] CRITICAL ERROR fetching liked meal names from Firestore:", error);
        if (error.code) {
            console.error("[My Meals Load Effect] Firestore Error Code:", error.code);
        }
        if (error.message) {
            console.error("[My Meals Load Effect] Firestore Error Message:", error.message);
        }
        console.error("[My Meals Load Effect] Full Firestore Error Object:", error);
        toast({ title: "เกิดข้อผิดพลาด", description: "ไม่สามารถโหลดรายการที่ถูกใจจากระบบคลาวด์ได้", variant: "destructive" });
      }
    } else { 
      if (currentUser) { 
        console.warn(`[My Meals Load Effect] currentUser object exists but UID is invalid or empty. UID: '${localUserId}'. Skipping Firestore fetch, will use localStorage.`);
      }
      console.log('[My Meals Load Effect] User not logged in or UID invalid. Fetching from localStorage.');
      const localData = localStorage.getItem(LOCAL_STORAGE_LIKED_MEALS_KEY);
      if (localData) {
        try {
          const names: string[] = JSON.parse(localData);
          fetchedMealItems = names.map(name => ({ name })).sort((a, b) => a.name.localeCompare(b.name)); 
          console.log('[My Meals Load Effect] Fetched from localStorage:', fetchedMealItems.map(i => i.name));
        } catch (e) {
          console.error("[My Meals Load Effect] Error parsing liked meal names from localStorage:", e);
          localStorage.removeItem(LOCAL_STORAGE_LIKED_MEALS_KEY); 
          toast({ title: "ข้อมูลที่ถูกใจเสียหาย", description: "ข้อมูลที่ถูกใจในเครื่องถูกล้าง โปรดลองใหม่อีกครั้ง", variant: "destructive" });
        }
      } else {
         console.log('[My Meals Load Effect] No data in localStorage.');
      }
    }
    setLikedMealsList(fetchedMealItems);
    setIsLoadingMyMeals(false);
    console.log('[My Meals Load Effect] Finished loading. likedMealsList state updated with count:', fetchedMealItems.length);
  };

  useEffect(() => {
    loadUserLikedMealNames();
  }, [currentUser]);
  

  useEffect(() => {
    setIsCurrentFoodLiked(false); 
    const currentFoodName = imageAnalysisResult?.foodItem;
    if (currentFoodName && currentFoodName !== UNIDENTIFIED_FOOD_MESSAGE) {
      const isLiked = likedMealsList.some(meal => meal.name === currentFoodName);
      setIsCurrentFoodLiked(isLiked);
      console.log(`[Like Status Effect] Food: "${currentFoodName}", Is Liked: ${isLiked}. Checked against likedMealsList (count: ${likedMealsList.length}):`, likedMealsList.map(m => m.name));
    } else {
      if (currentFoodName === UNIDENTIFIED_FOOD_MESSAGE) {
        console.log(`[Like Status Effect] Food not identified. isCurrentFoodLiked set to false.`);
      } else if (!currentFoodName) {
        console.log(`[Like Status Effect] No current food name from analysis. isCurrentFoodLiked set to false.`);
      }
    }
  }, [imageAnalysisResult, likedMealsList]);

  useEffect(() => {
    if (chatScrollAreaRef.current) {
      const scrollableViewport = chatScrollAreaRef.current.querySelector('div[data-radix-scroll-area-viewport]');
      if (scrollableViewport) {
        scrollableViewport.scrollTop = scrollableViewport.scrollHeight;
      }
    }
  }, [chatMessages]);


  const formatDate = (timestamp: FirestoreTimestamp | Date | undefined) => {
    if (!timestamp) return 'ไม่ระบุวันที่';
    const date = timestamp instanceof FirestoreTimestamp ? timestamp.toDate() : timestamp;
    try {
      return format(date, "d MMM yy", { locale: th }); 
    } catch (error) {
      console.error("Error formatting date:", error, timestamp);
      return 'วันที่ไม่ถูกต้อง';
    }
  };
  
  const handleLogout = async () => {
    try {
      await signOut(auth);
      toast({
        title: "ออกจากระบบสำเร็จ",
      });
      console.log('[Logout] User logged out.');
    } catch (error: unknown) {
      console.error("Logout error:", error);
      toast({
        title: "เกิดข้อผิดพลาดในการออกจากระบบ",
        variant: "destructive",
      });
    }
  };

  const resetImageRelatedStates = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setImageAnalysisResult(null);
    setImageError(null);
    console.log('[State Reset] Image related states reset.');
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
      console.log('[File Change] New file selected:', file.name);
    }
  };

  const handleImageAnalysis = async () => {
    if (!selectedFile) {
      setImageError('โปรดเลือกไฟล์รูปภาพก่อน');
      return;
    }
    setIsLoadingImageAnalysis(true);
    setImageError(null);
    console.log('[Image Analysis] Starting analysis for file:', selectedFile.name);
    
    const reader = new FileReader();
    reader.readAsDataURL(selectedFile);
    reader.onload = async () => {
      const foodImage = reader.result as string;
      try {
        const result = await scanFoodImage({ foodImage } as ScanFoodImageInput);
        setImageAnalysisResult(result); 
        console.log('[Image Analysis] Analysis successful. Result:', result);
        
        const identified = result.foodItem !== UNIDENTIFIED_FOOD_MESSAGE;
        if (identified) {
          toast({
            title: "การวิเคราะห์เสร็จสมบูรณ์",
            description: `ระบุได้ว่าเป็น: ${result.foodItem}`,
          });
        } else {
          toast({
            title: "หมายเหตุการวิเคราะห์",
            description: "ไม่สามารถระบุรายการอาหารจากภาพที่ให้มาได้ โปรดลองภาพอื่น",
            variant: "default"
          });
        }
      } catch (error: unknown) {
        console.error('[Image Analysis] Error analyzing image:', error);
        let errorMessage = 'วิเคราะห์รูปภาพไม่สำเร็จ โปรดลองอีกครั้ง';
        if (error instanceof Error) {
          errorMessage = error.message;
        }
        setImageError(errorMessage);
        setImageAnalysisResult(null); 
        toast({
          title: "เกิดข้อผิดพลาดในการวิเคราะห์",
          description: errorMessage,
          variant: "destructive",
        });
      } finally {
        setIsLoadingImageAnalysis(false);
        console.log('[Image Analysis] Analysis process finished.');
      }
    };
    reader.onerror = () => {
      setImageError('ไม่สามารถอ่านไฟล์รูปภาพที่เลือก');
      setIsLoadingImageAnalysis(false);
      setImageAnalysisResult(null); 
      toast({
          title: "ข้อผิดพลาดในการอ่านไฟล์",
          description: "ไม่สามารถอ่านไฟล์รูปภาพที่เลือก",
          variant: "destructive",
        });
      console.error('[Image Analysis] FileReader error.');
    };
  };

  const handleToggleLike = async (foodNameToToggle: string | null | undefined) => {
    if (!foodNameToToggle || foodNameToToggle === UNIDENTIFIED_FOOD_MESSAGE) {
      toast({ title: "ไม่สามารถถูกใจได้", description: "ไม่สามารถระบุชื่ออาหารได้", variant: "destructive" });
      return;
    }
    console.log(`[Toggle Like] Action for: "${foodNameToToggle}". User: ${currentUser?.uid || 'Anonymous'}. Current isCurrentFoodLiked state by effect: ${isCurrentFoodLiked}`);
    setIsLiking(true);

    try {
      const alreadyLikedInCurrentList = likedMealsList.some(meal => meal.name === foodNameToToggle);
      console.log(`[Toggle Like] Food "${foodNameToToggle}" is ${alreadyLikedInCurrentList ? 'FOUND' : 'NOT FOUND'} in current likedMealsList (count: ${likedMealsList.length}). Current isCurrentFoodLiked (button state before click) was ${isCurrentFoodLiked}. Action will be to ${alreadyLikedInCurrentList ? 'UNLIKE' : 'LIKE'}.`);
      
      if (currentUser?.uid) { 
        const userId = currentUser.uid;
        console.log(`[Toggle Like - Firestore] Current User ID: '${userId}'`);
        if (!userId || typeof userId !== 'string' || userId.trim() === '') {
            console.error("[Toggle Like - Firestore] Invalid User ID. Aborting Firestore operation.");
            toast({ title: "ข้อผิดพลาด", description: "ไม่สามารถดำเนินการได้เนื่องจาก ID ผู้ใช้ไม่ถูกต้อง", variant: "destructive"});
        } else {
            const likedMealNamesRef = collection(db, 'users', userId, 'likedMealNames');
            if (alreadyLikedInCurrentList) { 
              console.log(`[Toggle Like - Firestore] Attempting to UNLIKE "${foodNameToToggle}"`);
              try {
                const q = query(likedMealNamesRef, where("foodName", "==", foodNameToToggle));
                const querySnapshot = await getDocs(q);
                if (!querySnapshot.empty) {
                  const docIdToDelete = querySnapshot.docs[0].id;
                  await deleteDoc(doc(db, 'users', userId, 'likedMealNames', docIdToDelete));
                  setLikedMealsList(prev => prev.filter(meal => meal.name !== foodNameToToggle));
                  setIsCurrentFoodLiked(false); 
                  toast({ description: `"${foodNameToToggle}" ถูกนำออกจากรายการที่ถูกใจแล้ว` });
                  console.log(`[Toggle Like - Firestore] UNLIKED and removed from Firestore: "${foodNameToToggle}" (Doc ID: ${docIdToDelete}). likedMealsList updated.`);
                } else {
                  console.warn(`[Toggle Like - Firestore] Tried to unlike "${foodNameToToggle}", but not found in DB. State might be inconsistent. Forcing local removal.`);
                  setLikedMealsList(prev => prev.filter(meal => meal.name !== foodNameToToggle)); 
                  setIsCurrentFoodLiked(false);
                }
              } catch (error: any) {
                console.error("[Toggle Like - Firestore] Error unliking meal:", error);
                if (error.code) console.error("[Toggle Like - Firestore] Unlike Error Code:", error.code);
                if (error.message) console.error("[Toggle Like - Firestore] Unlike Error Message:", error.message);
                toast({ title: "เกิดข้อผิดพลาด", description: "ไม่สามารถยกเลิกการถูกใจได้", variant: "destructive" });
              }
            } else { 
              console.log(`[Toggle Like - Firestore] Attempting to LIKE "${foodNameToToggle}"`);
              try {
                const newMealData = { foodName: foodNameToToggle, likedAt: serverTimestamp() };
                console.log('[Toggle Like - Firestore] Data to be added to Firestore:', newMealData);
                const newDocRef = await addDoc(likedMealNamesRef, newMealData);
                console.log(`[Toggle Like - Firestore] Successfully added to Firestore. New Doc ID: ${newDocRef.id}`);

                const newItem: LikedMealItem = { name: foodNameToToggle, id: newDocRef.id, likedAt: new Date() }; 
                setLikedMealsList(prev => [{ name: foodNameToToggle, id: newDocRef.id, likedAt: new Date() }, ...prev].sort((a,b) => (b.likedAt instanceof Date && a.likedAt instanceof Date) ? b.likedAt.getTime() - a.likedAt.getTime() : 0));
                setIsCurrentFoodLiked(true); 
                toast({ description: `ถูกใจ "${foodNameToToggle}" แล้ว!`});
                console.log(`[Toggle Like - Firestore] LIKED and added to Firestore: "${foodNameToToggle}". likedMealsList updated.`);
              } catch (error: any) {
                console.error("[Toggle Like - Firestore] Error liking meal:", error);
                if (error.code) console.error("[Toggle Like - Firestore] Like Error Code:", error.code);
                if (error.message) console.error("[Toggle Like - Firestore] Like Error Message:", error.message);
                toast({ title: "เกิดข้อผิดพลาด", description: "ไม่สามารถถูกใจได้", variant: "destructive" });
              }
            }
        }
      } else { 
        let currentLocalLikedNames: string[] = [];
        const storedNamesJson = localStorage.getItem(LOCAL_STORAGE_LIKED_MEALS_KEY);
        if (storedNamesJson) {
          try {
            currentLocalLikedNames = JSON.parse(storedNamesJson);
          } catch (e) { console.error("Error parsing localStorage for likes", e); currentLocalLikedNames = [];}
        }

        if (alreadyLikedInCurrentList) { 
          console.log(`[Toggle Like - localStorage] Attempting to UNLIKE "${foodNameToToggle}"`);
          currentLocalLikedNames = currentLocalLikedNames.filter(name => name !== foodNameToToggle);
          setIsCurrentFoodLiked(false); 
          toast({ description: `"${foodNameToToggle}" ถูกนำออกจากรายการที่ถูกใจแล้ว` });
          console.log(`[Toggle Like - localStorage] UNLIKED and removed: "${foodNameToToggle}"`);
        } else { 
          console.log(`[Toggle Like - localStorage] Attempting to LIKE "${foodNameToToggle}"`);
          currentLocalLikedNames.push(foodNameToToggle);
          setIsCurrentFoodLiked(true); 
          toast({ description: `ถูกใจ "${foodNameToToggle}" แล้ว!` });
          console.log(`[Toggle Like - localStorage] LIKED and added: "${foodNameToToggle}"`);
        }
        localStorage.setItem(LOCAL_STORAGE_LIKED_MEALS_KEY, JSON.stringify(currentLocalLikedNames));
        setLikedMealsList(currentLocalLikedNames.map(name => ({ name })).sort((a,b) => a.name.localeCompare(b.name))); 
        console.log(`[Toggle Like - localStorage] likedMealsList updated.`);
      }
    } catch (error) {
      console.error("[Toggle Like] UNEXPECTED CRITICAL ERROR in handleToggleLike:", error);
      toast({ title: "เกิดข้อผิดพลาดร้ายแรง", description: "การดำเนินการถูกใจล้มเหลว โปรดลองอีกครั้ง", variant: "destructive" });
    } finally {
      setIsLiking(false);
      console.log(`[Toggle Like] FINALLY: isLiking set to false for "${foodNameToToggle}".`);
    }
  };
  
  const openMyMealsDialog = () => {
    console.log("[My Meals Dialog] Opening dialog. Current likedMealsList count:", likedMealsList.length);
    setIsMyMealsDialogOpen(true);
  };

  const handleChatSubmit = async (event?: React.FormEvent) => {
    if (event) event.preventDefault();
    const messageContent = chatInput.trim();
    if (!messageContent) return;

    const newUserMessage: ChatMessage = { role: 'user', content: messageContent };
    setChatMessages(prev => [...prev, newUserMessage]);
    setChatInput('');
    if(chatInputRef.current) chatInputRef.current.value = ''; // Clear textarea
    setIsChatLoading(true);

    try {
      const chatHistoryForAPI = chatMessages.slice(-5); 
      const result: AIChatOutput = await chatWithBot({ message: messageContent, history: chatHistoryForAPI });
      const newBotMessage: ChatMessage = { role: 'model', content: result.response };
      setChatMessages(prev => [...prev, newBotMessage]);
    } catch (error) {
      console.error("Error in chatWithBot:", error);
      const errorMessage: ChatMessage = { role: 'model', content: "ขออภัยค่ะ มีปัญหาในการเชื่อมต่อกับ AI โปรดลองอีกครั้ง" };
      setChatMessages(prev => [...prev, errorMessage]);
      toast({
        title: "Chatbot Error",
        description: "ไม่สามารถรับการตอบกลับจาก AI ได้",
        variant: "destructive",
      });
    } finally {
      setIsChatLoading(false);
       if(chatInputRef.current) chatInputRef.current.focus();
    }
  };

  const handleConfirmClearAllLikedMeals = async () => {
    setIsClearingMeals(true);
    console.log("[Clear All Meals] Starting operation. User:", currentUser?.uid || "Anonymous");
    try {
      if (currentUser?.uid) {
        const userId = currentUser.uid;
        if (!userId || typeof userId !== 'string' || userId.trim() === '') {
          toast({ title: "ข้อผิดพลาด", description: "ID ผู้ใช้ไม่ถูกต้อง ไม่สามารถล้างข้อมูลได้", variant: "destructive" });
          setIsClearingMeals(false); 
          setIsClearConfirmOpen(false);
          return;
        }
        console.log(`[Clear All Meals - Firestore] Clearing for user ID: ${userId}`);
        const likedMealNamesRef = collection(db, 'users', userId, 'likedMealNames');
        const querySnapshot = await getDocs(likedMealNamesRef);
        
        if (querySnapshot.empty) {
          console.log("[Clear All Meals - Firestore] No meals to clear.");
        } else {
          const batch = writeBatch(db);
          querySnapshot.docs.forEach((doc) => {
            batch.delete(doc.ref);
          });
          await batch.commit();
          console.log(`[Clear All Meals - Firestore] Successfully cleared ${querySnapshot.size} meals.`);
        }
      } else {
        console.log("[Clear All Meals - localStorage] Clearing for anonymous user.");
        localStorage.removeItem(LOCAL_STORAGE_LIKED_MEALS_KEY);
      }
      setLikedMealsList([]);
      setIsCurrentFoodLiked(false); 
      toast({ description: "ล้างรายการอาหารที่ถูกใจทั้งหมดแล้ว" });
    } catch (error) {
      console.error("Error clearing all liked meals:", error);
      toast({ title: "เกิดข้อผิดพลาด", description: "ไม่สามารถล้างรายการอาหารที่ถูกใจได้", variant: "destructive" });
    } finally {
      setIsClearingMeals(false);
      setIsClearConfirmOpen(false); 
      setIsMyMealsDialogOpen(false); 
      console.log("[Clear All Meals] Operation finished.");
    }
  };

  // Login Dialog Content Component
  const LoginDialogContent = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
  
    const handleLogin = async (event: React.FormEvent) => {
      event.preventDefault();
      setIsLoading(true);
      try {
        await signInWithEmailAndPassword(auth, email, password);
        toast({
          title: "เข้าสู่ระบบสำเร็จ",
          description: "ยินดีต้อนรับกลับ!",
        });
        setIsLoginDialogOpen(false); 
      } catch (error: any) {
        console.error('Login error:', error);
        let errorMessage = "เกิดข้อผิดพลาดในการเข้าสู่ระบบ";
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
          errorMessage = "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
        } else if (error.code === 'auth/invalid-email') {
          errorMessage = "รูปแบบอีเมลไม่ถูกต้อง";
        }
        toast({
          title: "เข้าสู่ระบบไม่สำเร็จ",
          description: errorMessage,
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    return (
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl font-headline text-primary text-center">เข้าสู่ระบบ</DialogTitle>
          <DialogDescription className="text-center">
            ยินดีต้อนรับกลับ! กรอกข้อมูลเพื่อเข้าสู่ระบบ
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleLogin} className="space-y-6 px-6 pb-6">
          <div className="space-y-2">
            <Label htmlFor="login-email">อีเมล</Label>
            <Input
              id="login-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="text-lg p-3"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="login-password">รหัสผ่าน</Label>
            <Input
              id="login-password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="text-lg p-3"
            />
          </div>
          <Button type="submit" className="w-full text-lg py-6" size="lg" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="animate-spin -ml-1 mr-3 h-5 w-5" />
                กำลังเข้าสู่ระบบ...
              </>
            ) : (
              <>
                <LogIn className="mr-2 h-5 w-5" /> เข้าสู่ระบบ
              </>
            )}
          </Button>
        </form>
        <DialogFooter className="px-6 pb-6 flex flex-col items-center space-y-2 pt-0 border-t-0">
          <p className="text-sm text-muted-foreground">
            ยังไม่มีบัญชี?{' '}
            <Button
              variant="link"
              className="p-0 h-auto font-medium text-primary hover:underline"
              onClick={() => {
                setIsLoginDialogOpen(false);
                setIsRegisterDialogOpen(true);
              }}
            >
              <UserPlus className="mr-1 h-4 w-4" /> ลงทะเบียนที่นี่
            </Button>
          </p>
        </DialogFooter>
      </DialogContent>
    );
  };

  // Register Dialog Content Component
  const RegisterDialogContent = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
  
    const handleRegister = async (event: React.FormEvent) => {
      event.preventDefault();
      setIsLoading(true);
  
      if (password !== confirmPassword) {
        toast({
          title: "ลงทะเบียนไม่สำเร็จ",
          description: "รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน",
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }
  
      if (password.length < 6) {
        toast({
          title: "ลงทะเบียนไม่สำเร็จ",
          description: "รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร",
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }
  
      try {
        await createUserWithEmailAndPassword(auth, email, password);
        toast({
          title: "ลงทะเบียนสำเร็จ",
          description: "บัญชีของคุณถูกสร้างเรียบร้อยแล้ว",
        });
        setIsRegisterDialogOpen(false); 
      } catch (error: any) {
        console.error('Registration error:', error);
        let errorMessage = "เกิดข้อผิดพลาดในการลงทะเบียน";
        if (error.code === 'auth/email-already-in-use') {
          errorMessage = "อีเมลนี้ถูกใช้งานแล้ว";
        } else if (error.code === 'auth/invalid-email') {
          errorMessage = "รูปแบบอีเมลไม่ถูกต้อง";
        } else if (error.code === 'auth/weak-password') {
          errorMessage = "รหัสผ่านคาดเดายาก โปรดใช้รหัสผ่านที่ซับซ้อนกว่านี้";
        }
        toast({
          title: "ลงทะเบียนไม่สำเร็จ",
          description: errorMessage,
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    return (
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl font-headline text-primary text-center">สร้างบัญชีใหม่</DialogTitle>
          <DialogDescription className="text-center">
            กรอกข้อมูลเพื่อลงทะเบียนใช้งาน
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleRegister} className="space-y-6 px-6 pb-6">
            <div className="space-y-2">
              <Label htmlFor="register-email">อีเมล</Label>
              <Input
                id="register-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="text-lg p-3"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="register-password">รหัสผ่าน (อย่างน้อย 6 ตัวอักษร)</Label>
              <Input
                id="register-password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="text-lg p-3"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="register-confirmPassword">ยืนยันรหัสผ่าน</Label>
              <Input
                id="register-confirmPassword"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="text-lg p-3"
              />
            </div>
            <Button type="submit" className="w-full text-lg py-6" size="lg" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="animate-spin -ml-1 mr-3 h-5 w-5" />
                  กำลังลงทะเบียน...
                </>
              ) : (
                <>
                  <UserPlus className="mr-2 h-5 w-5" /> สร้างบัญชี
                </>
              )}
            </Button>
          </form>
          <DialogFooter className="px-6 pb-6 flex flex-col items-center space-y-2 pt-0 border-t-0">
            <p className="text-sm text-muted-foreground">
              มีบัญชีอยู่แล้ว?{' '}
              <Button
                variant="link"
                className="p-0 h-auto font-medium text-primary hover:underline"
                onClick={() => {
                  setIsRegisterDialogOpen(false);
                  setIsLoginDialogOpen(true);
                }}
              >
                 <LogIn className="mr-1 h-4 w-4" /> เข้าสู่ระบบที่นี่
              </Button>
            </p>
          </DialogFooter>
      </DialogContent>
    );
  };


  return (
    <div className="min-h-screen bg-background text-foreground font-body p-2 sm:p-4 md:p-8">
      <header className="py-4 sm:py-6 md:py-8 text-center bg-gradient-to-r from-primary/10 via-secondary/20 to-primary/10 rounded-lg shadow-md mb-6 sm:mb-8 md:mb-12">
        <div className="container mx-auto px-2 sm:px-4 flex justify-between items-center">
          <div className="flex-1 text-left md:text-center">
             <Link href="/" className="inline-block">
              <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-headline font-bold text-primary flex items-center justify-start md:justify-center">
                <Utensils className="w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10 lg:w-12 lg:h-12 mr-1 sm:mr-2 md:mr-4" />
                FSFA <span className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-normal ml-1 sm:ml-2 text-foreground/90">(Food Security For All 🍉🥗)</span>
              </h1>
            </Link>
            <p className="mt-1 text-xs sm:text-sm md:text-base lg:text-lg text-foreground/80 font-body text-left md:text-center">
              สร้างความมั่นคงทางอาหารและสุขภาวะทางโภชนาการที่ดีสำหรับทุกคน
            </p>
          </div>
          <div className="flex items-center space-x-1 sm:space-x-2 md:space-x-3 ml-1 sm:ml-2 md:ml-4">
            <Button
              variant="outline"
              size="icon"
              className="rounded-full w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 group"
              onClick={openMyMealsDialog}
              aria-label="มื้ออาหารของฉัน"
            >
              <ListChecks className="w-4 h-4 sm:w-5 sm:h-5 md:w-7 md:h-7 text-accent group-hover:text-primary" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="rounded-full w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 group">
                  <UserCircle className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 text-accent group-hover:text-primary" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>บัญชีของฉัน</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {currentUser ? (
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
                    <DropdownMenuItem onSelect={() => setIsLoginDialogOpen(true)} className="cursor-pointer">
                        <LogIn className="mr-2 h-4 w-4" />
                        <span>เข้าสู่ระบบ</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setIsRegisterDialogOpen(true)} className="cursor-pointer">
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

      <main className="container mx-auto px-1 sm:px-2 md:px-4 space-y-6 sm:space-y-8 md:space-y-10 lg:space-y-16">

        <PageSection title="อาหารอะไรที่อยู่บนจานของคุณ? 🤔🍽️" icon={<Brain />} id="image-scanner" className="bg-secondary/30 rounded-lg shadow-md" titleBgColor="bg-primary" titleTextColor="text-primary-foreground">
          <Card className="max-w-xl md:max-w-2xl mx-auto shadow-lg rounded-lg overflow-hidden bg-card">
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-lg sm:text-xl md:text-2xl font-headline text-primary">AI วิเคราะห์อาหาร 🤖🥕</CardTitle>
              <CardDescription className="text-xs sm:text-sm md:text-base font-body">อัปโหลดรูปภาพอาหาร แล้ว AI ของเราจะให้ข้อมูลทางโภชนาการและคำแนะนำด้านความปลอดภัย</CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 space-y-3 sm:space-y-4 md:space-y-6">
              <div>
                <Label htmlFor="food-image-upload" className="text-sm sm:text-base md:text-lg font-body text-foreground">อัปโหลดรูปภาพอาหาร</Label>
                <Input id="food-image-upload" type="file" accept="image/*" onChange={handleFileChange} className="mt-1 sm:mt-2 file:text-primary-foreground file:font-semibold file:mr-2 file:px-2 sm:file:px-3 file:py-1 file:rounded-md file:border-0 file:bg-primary hover:file:bg-primary/90 text-xs sm:text-sm md:text-base p-1 sm:p-2" />
              </div>
              
              {previewUrl && (
                 <div className="mt-2 sm:mt-4 md:mt-6 mb-2 sm:mb-4 md:mb-6 flex flex-col items-center space-y-1 sm:space-y-2 md:space-y-4 border border-border/60 p-2 sm:p-4 md:p-6 rounded-lg bg-muted/20 shadow-inner">
                    <div className="flex-shrink-0 flex flex-col items-center">
                      <p className="text-xs sm:text-sm font-body mb-1 sm:mb-2 text-muted-foreground">ตัวอย่างรูปภาพ:</p>
                      <Image src={previewUrl} alt="Food preview" width={150} height={150} className="rounded-lg shadow-md object-contain max-h-36 sm:max-h-48 md:max-h-56 mx-auto" data-ai-hint="food meal" />
                    </div>
                  </div>
              )}

              {imageError && <p className="text-destructive text-xs sm:text-sm font-body flex items-center"><AlertCircle className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />{imageError}</p>}

              <Button 
                onClick={handleImageAnalysis} 
                disabled={isLoadingImageAnalysis || !selectedFile} 
                className="w-full text-sm sm:text-base md:text-lg py-2 sm:py-3 md:py-4" 
                size="default" 
              >
                {isLoadingImageAnalysis ? (
                  <>
                    <Loader2 className="animate-spin -ml-1 mr-2 sm:mr-3 h-4 w-4 sm:h-5 sm:h-5" />
                    กำลังวิเคราะห์...
                  </>
                ) : (
                  <> <UploadCloud className="mr-2 h-4 w-4 sm:h-5 sm:h-5 md:h-6 md:w-6" /> วิเคราะห์รูปภาพ </>
                )}
              </Button>

              {imageAnalysisResult && (
                <Card className="mt-4 sm:mt-6 md:mt-8 shadow-md rounded-lg overflow-hidden bg-card border border-primary/30">
                  <CardHeader className="p-3 sm:p-4 pb-1 sm:pb-2 bg-primary/10">
                      <CardTitle className="text-base sm:text-lg md:text-xl font-headline text-primary flex items-center">
                      {isFoodIdentified ? <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 mr-2 text-green-500" /> : <Info className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 mr-2 text-yellow-500" />}
                      ผลการวิเคราะห์
                      </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 sm:p-4 md:p-6 space-y-2 sm:space-y-3 md:space-y-4">
                    <div>
                      <div className="flex items-center justify-between">
                        <h4 className="font-semibold text-sm sm:text-base md:text-lg font-body text-foreground">
                          {imageAnalysisResult.foodItem === UNIDENTIFIED_FOOD_MESSAGE ? "อาหารที่ระบุได้:" : "อาหารที่ระบุได้:"}
                        </h4>
                        {isFoodIdentified && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleToggleLike(imageAnalysisResult?.foodItem)}
                            disabled={isLiking}
                            className="rounded-full hover:bg-pink-500/10 data-[state=liked]:bg-green-500/20 w-7 h-7 sm:w-8 sm:h-8 md:w-9 md:h-9"
                            data-state={isCurrentFoodLiked ? 'liked' : 'unliked'}
                            aria-label={isCurrentFoodLiked ? 'ยกเลิกการถูกใจ' : 'ถูกใจ'}
                          >
                            {isLiking ? (
                              <Loader2 className="h-4 w-4 sm:h-5 sm:h-5 md:h-6 md:h-6 animate-spin" />
                            ) : (
                              <Heart className={`h-4 w-4 sm:h-5 sm:h-5 md:h-6 md:h-6 transition-colors ${isCurrentFoodLiked ? 'fill-current text-green-600' : 'text-pink-500'}`} />
                            )}
                          </Button>
                        )}
                      </div>
                      <p className="text-xs sm:text-sm md:text-base font-body text-foreground/80">
                        {imageAnalysisResult.foodItem === UNIDENTIFIED_FOOD_MESSAGE 
                           ? "ขออภัยค่ะ ไม่สามารถระบุรายการอาหารในภาพได้ชัดเจน โปรดลองภาพอื่นที่มีแสงสว่างเพียงพอ หรือลองเปลี่ยนมุมถ่ายภาพนะคะ"
                           : imageAnalysisResult.foodItem
                        }
                      </p>
                    </div>
                    
                    {isFoodIdentified && imageAnalysisResult.nutritionalInformation !== GENERIC_NUTRITION_UNAVAILABLE && (
                      <>
                        <Separator />
                        <div>
                          <h4 className="font-semibold text-sm sm:text-base md:text-lg font-body text-foreground">ข้อมูลทางโภชนาการ:</h4>
                          <ScrollArea className="max-h-24 sm:max-h-32 md:max-h-40 pr-1 sm:pr-2">
                              <p className="text-xs sm:text-sm md:text-base font-body text-foreground/80 whitespace-pre-wrap">{imageAnalysisResult.nutritionalInformation}</p>
                          </ScrollArea>
                        </div>
                      </>
                    )}
                    {isFoodIdentified && (imageAnalysisResult.safetyPrecautions && imageAnalysisResult.safetyPrecautions.some(p => p !== GENERIC_SAFETY_UNAVAILABLE)) && (
                      <>
                        <Separator />
                        <div>
                          <h4 className="font-semibold text-sm sm:text-base md:text-lg font-body text-foreground flex items-center">
                            <MessageSquareWarning className="w-3 h-3 sm:w-4 sm:h-4 md:w-5 md:h-5 mr-1 sm:mr-2 text-orange-500"/>คำแนะนำด้านความปลอดภัย:
                          </h4>
                          <ScrollArea className="max-h-24 sm:max-h-32 md:max-h-40 mt-1 sm:mt-2 pr-1 sm:pr-2">
                              <ul className="list-disc pl-3 sm:pl-4 md:pl-5 space-y-1 text-xs sm:text-sm md:text-base font-body text-foreground/80">
                                {imageAnalysisResult.safetyPrecautions.map((precaution, index) => (
                                  precaution !== GENERIC_SAFETY_UNAVAILABLE ? <li key={index}>{precaution}</li> : null
                                )).filter(Boolean)}
                              </ul>
                          </ScrollArea>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </PageSection>

        <PageSection title="พูดคุยกับ AI ผู้ช่วย 💬🧠" icon={<MessageCircle />} id="chatbot-section" className="bg-secondary/30 rounded-lg shadow-md" titleBgColor="bg-accent" titleTextColor="text-accent-foreground">
          <Card className="max-w-xl md:max-w-2xl mx-auto shadow-lg rounded-lg overflow-hidden bg-card">
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-lg sm:text-xl md:text-2xl font-headline text-accent">Momu Ai</CardTitle>
              <CardDescription className="text-xs sm:text-sm md:text-base font-body">สอบถามเกี่ยวกับอาหารและโภชนาการได้ที่นี้😉</CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 space-y-2 sm:space-y-3 md:space-y-4">
              <ScrollArea className="h-48 sm:h-60 md:h-72 w-full border rounded-md p-2 sm:p-4 bg-muted/30" viewportRef={chatScrollAreaRef}>
                {chatMessages.length === 0 && (
                  <p className="text-center text-xs sm:text-sm md:text-base text-muted-foreground">เริ่มต้นการสนทนาได้เลยค่ะ...</p>
                )}
                {chatMessages.map((msg, index) => (
                  <div
                    key={index}
                    className={`mb-1 sm:mb-2 md:mb-3 flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`p-2 sm:p-3 rounded-lg max-w-[80%] shadow ${
                        msg.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary text-secondary-foreground'
                      }`}
                    >
                      <p className="text-xs sm:text-sm whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                ))}
                {isChatLoading && (
                  <div className="flex justify-start mb-1 sm:mb-2">
                    <div className="p-2 sm:p-3 rounded-lg bg-secondary text-secondary-foreground shadow">
                      <Loader2 className="h-3 w-3 sm:h-4 sm:h-4 md:h-5 md:h-5 animate-spin" />
                    </div>
                  </div>
                )}
              </ScrollArea>
              <form onSubmit={handleChatSubmit} className="flex items-center space-x-1 sm:space-x-2">
                <Textarea
                  ref={chatInputRef}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="พิมพ์ข้อความของคุณที่นี่..."
                  className="flex-grow resize-none p-2 md:p-3 text-xs sm:text-sm md:text-base"
                  rows={1}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleChatSubmit();
                    }
                  }}
                />
                <Button 
                  type="submit" 
                  size="default" 
                  className="text-sm sm:text-base md:text-lg py-2 md:py-3 px-2 sm:px-3 md:px-4" 
                  disabled={isChatLoading || !chatInput.trim()}
                >
                  {isChatLoading ? <Loader2 className="animate-spin h-3 w-3 sm:h-4 sm:h-4 md:h-5 md:h-5" /> : <Send className="h-3 w-3 sm:h-4 sm:h-4 md:h-5 md:h-5" />}
                  <span className="sr-only">Send</span>
                </Button>
              </form>
            </CardContent>
          </Card>
        </PageSection>

      </main>

      {/* My Meals Dialog */}
      <Dialog open={isMyMealsDialogOpen} onOpenChange={setIsMyMealsDialogOpen}>
        <DialogContent className="max-w-xs sm:max-w-sm md:max-w-md min-h-[60vh] sm:min-h-[50vh] flex flex-col p-3 sm:p-4 md:p-6"> 
          <DialogHeader>
            <DialogTitle className="text-lg sm:text-xl md:text-2xl font-headline text-primary flex items-center">
              <ListChecks className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 mr-2" />
              มื้ออาหารของฉัน
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              รายการชื่ออาหารที่คุณกดถูกใจไว้
            </DialogDescription>
          </DialogHeader>
          <div className="flex-grow overflow-hidden py-1 sm:py-2 md:py-4">
            <ScrollArea className="h-full pr-1 sm:pr-2"> 
              {isLoadingMyMeals ? (
                <div className="space-y-1 sm:space-y-2 md:space-y-3 p-1">
                  {[...Array(5)].map((_, index) => ( 
                    <Skeleton key={index} className="h-6 sm:h-7 md:h-8 w-full rounded-md" />
                  ))}
                </div>
              ) : likedMealsList.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-2 sm:p-4 md:p-6">
                  <Info className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 text-primary mb-1 sm:mb-2 md:mb-3" /> 
                  <p className="text-sm sm:text-base md:text-lg font-semibold text-foreground">ยังไม่มีมื้ออาหารที่ถูกใจ</p>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    เมื่อคุณกดถูกใจมื้ออาหารที่สแกนแล้ว ชื่ออาหารจะแสดงที่นี่ค่ะ
                  </p>
                  <Button onClick={() => setIsMyMealsDialogOpen(false)} className="mt-2 sm:mt-3 md:mt-4 text-xs sm:text-sm" size="sm">
                    <Utensils className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" /> ไปสแกนอาหาร
                  </Button>
                </div>
              ) : (
                <ul className="space-y-1 sm:space-y-2 p-1">
                  {likedMealsList.map((meal, index) => (
                    <li key={meal.id || `${meal.name}-${index}`} className="p-2 sm:p-3 bg-card border rounded-lg shadow-sm text-foreground font-body text-xs sm:text-sm md:text-base hover:bg-muted/40 transition-colors duration-150 cursor-default">
                      {meal.name}
                      {meal.likedAt && currentUser && (
                        <span className="block text-xs text-muted-foreground mt-1">
                          ถูกใจเมื่อ: {formatDate(meal.likedAt)}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
          </div>
          <DialogFooter className="mt-auto pt-2 sm:pt-3 md:pt-4 border-t flex justify-between w-full">
            <AlertDialog open={isClearConfirmOpen} onOpenChange={setIsClearConfirmOpen}>
              <AlertDialogTrigger asChild>
                <Button 
                  variant="destructive" 
                  size="sm"
                  disabled={likedMealsList.length === 0 || isClearingMeals}
                  className="flex items-center text-xs sm:text-sm"
                  onClick={() => setIsClearConfirmOpen(true)}
                >
                  {isClearingMeals ? <Loader2 className="animate-spin mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" /> : <Trash2 className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />}
                  ล้างทั้งหมด
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="p-3 sm:p-4 md:p-6">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-sm sm:text-base md:text-lg">ยืนยันการล้างข้อมูล</AlertDialogTitle>
                  <AlertDialogDescription className="text-xs sm:text-sm">
                    คุณแน่ใจหรือไม่ว่าต้องการล้างมื้ออาหารที่ถูกใจทั้งหมด? การกระทำนี้ไม่สามารถยกเลิกได้
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => setIsClearConfirmOpen(false)} disabled={isClearingMeals} size="sm" className="text-xs sm:text-sm">ยกเลิก</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={handleConfirmClearAllLikedMeals} 
                    disabled={isClearingMeals}
                    className="bg-destructive hover:bg-destructive/90 text-xs sm:text-sm"
                    size="sm"
                  >
                    {isClearingMeals ? <Loader2 className="animate-spin mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" /> : null}
                    ยืนยันล้างทั้งหมด
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <DialogClose asChild>
              <Button variant="outline" size="sm" className="text-xs sm:text-sm">
                ปิด
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Login Dialog */}
      <Dialog open={isLoginDialogOpen} onOpenChange={setIsLoginDialogOpen}>
        <LoginDialogContent />
      </Dialog>

      {/* Register Dialog */}
      <Dialog open={isRegisterDialogOpen} onOpenChange={setIsRegisterDialogOpen}>
        <RegisterDialogContent />
      </Dialog>


      <footer className="text-center py-4 sm:py-6 md:py-8 mt-6 sm:mt-8 md:mt-12 lg:mt-16 border-t border-border/50">
        <p className="text-xs sm:text-sm text-muted-foreground font-body">&copy; {new Date().getFullYear()} FSFA (Food Security For All) สงวนลิขสิทธิ์</p>
      </footer>
    </div>
  );
}
    
