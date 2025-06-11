
"use client";

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { analyzeFoodImage, type AnalyzeFoodImageInput, type AnalyzeFoodImageOutput } from '@/ai/flows/food-image-analyzer';
import { askQuestion, type AskQuestionInput, type AskQuestionOutput } from '@/ai/flows/interactive-q-and-a';

// ShadCN UI Components
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';

// Lucide Icons
import { UploadCloud, Bot, Brain, Utensils, AlertCircle, CheckCircle, Info, Lightbulb, MessagesSquare, Newspaper } from 'lucide-react';

// Article Data Type
interface Article {
  id: string;
  title: string;
  summary: string;
  imageUrl: string;
  imageHint: string; 
  content: string[]; 
}

// Sample Articles
const articles: Article[] = [
  {
    id: 'food-labels',
    title: "Decoding Food Labels: A Senior's Guide",
    summary: "Understand nutritional labels to make informed food choices for a healthier lifestyle.",
    imageUrl: 'https://placehold.co/600x400.png',
    imageHint: 'nutrition label',
    content: [
      "Food labels provide a wealth of information that can help you manage your diet and health. Key things to look for include serving size, calories, total fat (especially saturated and trans fats), cholesterol, sodium, total carbohydrates (including fiber and sugars), and protein.",
      "Pay attention to the % Daily Value (%DV). This tells you how much a nutrient in a serving of food contributes to a total daily diet. 5% DV or less of a nutrient per serving is considered low, while 20% DV or more is considered high.",
      "Look for foods high in fiber, vitamins, and minerals, and low in saturated fat, trans fat, sodium, and added sugars. Understanding these components can empower you to choose foods that support your specific health needs."
    ],
  },
  {
    id: 'food-safety',
    title: 'Safe Food Handling at Home',
    summary: 'Follow these best practices to prevent foodborne illnesses and ensure your meals are safe to eat.',
    imageUrl: 'https://placehold.co/600x400.png',
    imageHint: 'kitchen safety',
    content: [
      "Seniors can be more vulnerable to foodborne illnesses due to changes in their immune system. Practicing safe food handling is crucial. Remember the four key steps: Clean, Separate, Cook, and Chill.",
      "Clean: Wash hands, surfaces, and produce thoroughly. Separate: Keep raw meats, poultry, seafood, and eggs separate from ready-to-eat foods to prevent cross-contamination.",
      "Cook: Cook foods to the correct internal temperatures to kill harmful bacteria. Use a food thermometer. Chill: Refrigerate perishable foods promptly, within two hours (or one hour if the temperature is above 90°F)."
    ],
  },
];


// Chat Message Type
interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: Date;
}

export default function SeniorSafePage() {
  const { toast } = useToast();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageAnalysisResult, setImageAnalysisResult] = useState<AnalyzeFoodImageOutput | null>(null);
  const [isLoadingImageAnalysis, setIsLoadingImageAnalysis] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  const [showQaSection, setShowQaSection] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isLoadingQa, setIsLoadingQa] = useState(false);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
      setImageAnalysisResult(null); 
      setShowQaSection(false); 
      setImageError(null);
    }
  };

  const handleImageAnalysis = async () => {
    if (!selectedFile) {
      setImageError('Please select an image file first.');
      return;
    }
    setIsLoadingImageAnalysis(true);
    setImageError(null);
    setImageAnalysisResult(null);

    const reader = new FileReader();
    reader.readAsDataURL(selectedFile);
    reader.onload = async () => {
      const foodPhotoDataUri = reader.result as string;
      try {
        const result = await analyzeFoodImage({ foodPhotoDataUri } as AnalyzeFoodImageInput);
        setImageAnalysisResult(result);
        if (result.isIdentified) {
          toast({
            title: "Analysis Complete",
            description: `Identified: ${result.identification.foodName}`,
          });
          setShowQaSection(true);
        } else {
          toast({
            title: "Analysis Note",
            description: "Could not identify the food item. You can ask questions below.",
          });
           setShowQaSection(true);
        }
      } catch (error) {
        console.error('Error analyzing image:', error);
        setImageError('Failed to analyze image. Please try again.');
        toast({
          title: "Analysis Error",
          description: "An error occurred during image analysis.",
          variant: "destructive",
        });
      } finally {
        setIsLoadingImageAnalysis(false);
      }
    };
    reader.onerror = () => {
      setImageError('Failed to read the image file.');
      setIsLoadingImageAnalysis(false);
       toast({
          title: "File Read Error",
          description: "Could not read the selected image file.",
          variant: "destructive",
        });
    };
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;

    const newUserMessage: ChatMessage = {
      id: `${Date.now()}-user`,
      sender: 'user',
      text: chatInput,
      timestamp: new Date(),
    };
    setChatMessages((prevMessages) => [...prevMessages, newUserMessage]);
    const currentChatInput = chatInput;
    setChatInput('');
    setIsLoadingQa(true);

    try {
      const aiResponse = await askQuestion({ question: currentChatInput } as AskQuestionInput);
      const newAiMessage: ChatMessage = {
        id: `${Date.now()}-ai`,
        sender: 'ai',
        text: aiResponse.answer,
        timestamp: new Date(),
      };
      setChatMessages((prevMessages) => [...prevMessages, newAiMessage]);
    } catch (error) {
      console.error('Error asking question:', error);
      const errorAiMessage: ChatMessage = {
        id: `${Date.now()}-ai-error`,
        sender: 'ai',
        text: "I'm sorry, I encountered an error trying to answer your question. Please try again.",
        timestamp: new Date(),
      };
      setChatMessages((prevMessages) => [...prevMessages, errorAiMessage]);
       toast({
          title: "Q&A Error",
          description: "An error occurred while fetching the answer.",
          variant: "destructive",
        });
    } finally {
      setIsLoadingQa(false);
    }
  };
  
  const chatScrollAreaRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (chatScrollAreaRef.current) {
        const { scrollHeight, clientHeight } = chatScrollAreaRef.current;
        chatScrollAreaRef.current.scrollTo({ top: scrollHeight - clientHeight, behavior: 'smooth' });
    }
  }, [chatMessages]);

  const PageSection: React.FC<{title: string; icon: React.ReactNode; children: React.ReactNode; id: string; className?: string; titleBgColor?: string; titleTextColor?: string;}> = ({ title, icon, children, id, className, titleBgColor = "bg-primary", titleTextColor = "text-primary-foreground" }) => (
    <section id={id} className={`py-12 animate-fadeIn ${className || ''}`}>
      <div className="container mx-auto px-4">
        <h2 className={`text-4xl font-headline font-semibold text-center mb-10 ${titleTextColor} ${titleBgColor} py-3 rounded-md shadow-md`}>
          {React.cloneElement(icon as React.ReactElement, { className: "inline-block w-10 h-10 mr-3" })}
          {title}
        </h2>
        {children}
      </div>
    </section>
  );


  return (
    <div className="min-h-screen bg-background text-foreground font-body p-4 md:p-8 animate-fadeIn">
      <header className="py-8 text-center bg-gradient-to-r from-primary/10 via-secondary/20 to-primary/10 rounded-lg shadow-md mb-12 animate-fadeIn">
        <div className="container mx-auto px-4">
          <h1 className="text-5xl font-headline font-bold text-primary flex items-center justify-center">
            <Utensils className="w-12 h-12 mr-4" />
            SeniorSafe
          </h1>
          <p className="mt-2 text-xl text-foreground/80 font-body">
            Your trusted partner for nutrition and food safety.
          </p>
        </div>
      </header>
      
      <main className="container mx-auto px-4 space-y-10 md:space-y-16">
        {articles.length > 0 && (
          <>
            <PageSection title="Nourish Your Knowledge" icon={<Newspaper />} id="articles" titleBgColor="bg-accent" titleTextColor="text-accent-foreground">
              <div className="grid md:grid-cols-1 lg:grid-cols-3 gap-8">
                {articles.map((article) => (
                  <Card key={article.id} className="flex flex-col shadow-lg hover:shadow-xl transition-shadow duration-300 rounded-lg overflow-hidden bg-card">
                    <CardHeader className="p-0">
                      <div className="aspect-[16/9] relative w-full">
                         <Image 
                          src={article.imageUrl} 
                          alt={article.title} 
                          fill
                          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                          className="object-cover rounded-t-lg"
                          data-ai-hint={article.imageHint}
                          />
                      </div>
                      <div className="p-6">
                        <CardTitle className="text-2xl font-headline text-primary">{article.title}</CardTitle>
                        <CardDescription className="text-md font-body mt-1">{article.summary}</CardDescription>
                      </div>
                    </CardHeader>
                    <CardContent className="flex-grow p-6 pt-0">
                      {article.content.map((paragraph, index) => (
                        <p key={index} className="mb-3 text-foreground/90 font-body text-lg leading-relaxed">{paragraph}</p>
                      ))}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </PageSection>
            <Separator className="my-8 md:my-12" />
          </>
        )}
        
        <PageSection title="What's On Your Plate?" icon={<Brain />} id="image-scanner" className="bg-secondary/30 rounded-lg shadow-md" titleBgColor="bg-primary" titleTextColor="text-primary-foreground">
          <Card className="max-w-2xl mx-auto shadow-lg rounded-lg overflow-hidden bg-card">
            <CardHeader>
              <CardTitle className="text-2xl font-headline text-primary">AI Food Analyzer</CardTitle>
              <CardDescription className="text-md font-body">Upload an image of a food item, and our AI will provide nutritional information and safety advice.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label htmlFor="food-image-upload" className="text-lg font-body text-foreground">Upload Food Image</Label>
                <Input id="food-image-upload" type="file" accept="image/*" onChange={handleFileChange} className="mt-2 file:text-accent file:font-semibold file:mr-2 file:px-3 file:py-1 file:rounded-full file:border-0 file:bg-accent/20 hover:file:bg-accent/30 text-lg p-2" />
              </div>

              {previewUrl && (
                <div className="mt-4 text-center border border-dashed border-border p-4 rounded-md">
                  <p className="text-md font-body mb-2 text-muted-foreground">Image Preview:</p>
                  <Image src={previewUrl} alt="Food preview" width={300} height={300} className="rounded-md shadow-md mx-auto object-contain max-h-64" />
                </div>
              )}
              
              {imageError && <p className="text-destructive text-sm font-body flex items-center"><AlertCircle className="w-4 h-4 mr-1" />{imageError}</p>}

              <Button onClick={handleImageAnalysis} disabled={isLoadingImageAnalysis || !selectedFile} className="w-full text-lg py-6" size="lg">
                {isLoadingImageAnalysis ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Analyzing...
                  </>
                ) : (
                  <> <UploadCloud className="mr-2 h-6 w-6" /> Analyze Image </>
                )}
              </Button>

              {imageAnalysisResult && (
                <Card className="mt-6 bg-background/50 p-4 md:p-6 rounded-lg shadow-inner border border-border">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xl font-headline text-primary flex items-center">
                      {imageAnalysisResult.isIdentified ? <CheckCircle className="w-6 h-6 mr-2 text-green-500" /> : <Info className="w-6 h-6 mr-2 text-yellow-500" />}
                      Analysis Result
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-2">
                    {imageAnalysisResult.isIdentified ? (
                      <>
                        <div>
                          <h4 className="font-semibold text-lg font-body text-foreground">Food Identified:</h4>
                          <p className="text-md font-body text-foreground/80">{imageAnalysisResult.identification.foodName} (Confidence: {(imageAnalysisResult.identification.confidence * 100).toFixed(0)}%)</p>
                        </div>
                        <Separator />
                        <div>
                          <h4 className="font-semibold text-lg font-body text-foreground">Nutrition Information:</h4>
                          <p className="text-md font-body text-foreground/80 whitespace-pre-wrap">{imageAnalysisResult.nutritionInformation}</p>
                        </div>
                        <Separator />
                        <div>
                          <h4 className="font-semibold text-lg font-body text-foreground">Safety Advice:</h4>
                          <p className="text-md font-body text-foreground/80 whitespace-pre-wrap">{imageAnalysisResult.safetyAdvice}</p>
                        </div>
                      </>
                    ) : (
                       <p className="text-md font-body text-foreground/80">
                         I'm sorry, I couldn't quite identify the food item in the image. Sometimes images can be tricky!
                         Perhaps you could try a different angle, ensure good lighting, or upload another picture?
                         You can also ask me any questions about it in the Q&A section below.
                       </p>
                    )}
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </PageSection>
        
        {showQaSection && <Separator className="my-8 md:my-12" />}

        {showQaSection && (
          <PageSection title="Ask a Nutrition Expert" icon={<Bot />} id="q-and-a" className="shadow-md rounded-lg" titleBgColor="bg-accent" titleTextColor="text-accent-foreground">
             {imageAnalysisResult && !imageAnalysisResult.isIdentified && (
              <Card className="max-w-2xl mx-auto mb-6 bg-yellow-50 border-yellow-300 rounded-lg">
                <CardContent className="p-4">
                  <p className="text-center text-yellow-800 font-body text-md">
                    While I couldn't identify the food from the image, feel free to ask me any specific questions you have about it or general nutrition topics.
                  </p>
                </CardContent>
              </Card>
            )}
            <Card className="max-w-2xl mx-auto shadow-lg rounded-lg overflow-hidden bg-card">
              <CardHeader>
                <CardTitle className="text-2xl font-headline text-primary">Interactive Q&A</CardTitle>
                <CardDescription className="text-md font-body">Have questions about food safety or nutrition? Ask our AI assistant.</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-96 w-full pr-4 border border-border rounded-md p-4 mb-4 bg-secondary/20" viewportRef={chatScrollAreaRef}>
                  {chatMessages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                      <MessagesSquare className="w-16 h-16 mb-4" />
                      <p className="text-lg font-body">Ask a question to start the conversation.</p>
                       {imageAnalysisResult?.identification.foodName && imageAnalysisResult?.isIdentified && (
                          <p className="text-sm mt-2">e.g., "Tell me more about {imageAnalysisResult.identification.foodName}."</p>
                       )}
                    </div>
                  )}
                  {chatMessages.map((msg) => (
                    <div key={msg.id} className={`flex mb-4 animate-fadeIn ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`p-3 rounded-xl max-w-[80%] shadow-md ${msg.sender === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                        <p className="text-md font-body">{msg.text}</p>
                        <p className={`text-xs mt-1 ${msg.sender === 'user' ? 'text-primary-foreground/80 text-right' : 'text-muted-foreground/80 text-left'}`}>
                          {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  ))}
                </ScrollArea>
                <div className="flex items-center space-x-2">
                  <Input
                    type="text"
                    placeholder="Type your question..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && !isLoadingQa && handleSendMessage()}
                    className="flex-grow text-lg p-3 h-12"
                    disabled={isLoadingQa}
                  />
                  <Button onClick={handleSendMessage} disabled={isLoadingQa || !chatInput.trim()} size="lg" className="text-lg px-6 h-12 bg-accent hover:bg-accent/90">
                    {isLoadingQa ? (
                       <>
                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                           <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                           <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Sending...
                      </>
                    ) : "Ask"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </PageSection>
        )}
      </main>

      <footer className="text-center py-8 mt-12 md:mt-16 border-t border-border/50">
        <p className="text-muted-foreground font-body">&copy; {new Date().getFullYear()} SeniorSafe. All rights reserved.</p>
      </footer>
    </div>
  );
}
