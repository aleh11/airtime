import { Check, Palette } from 'lucide-react';
import { Button } from './ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { themeLabel } from '../themes';

interface ThemePickerProps {
    theme: string;
    themes: string[];
    onSelect: (theme: string) => void;
}

export function ThemePicker({ theme, themes, onSelect }: ThemePickerProps) {
    if (themes.length === 0) return null;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Change theme"
                    className="text-subtle-foreground hover:text-foreground"
                >
                    <Palette size={18} />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="font-mono text-[10px] tracking-wider text-subtle-foreground uppercase">
                    Theme
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {themes.map((id) => (
                    <DropdownMenuItem key={id} onSelect={() => onSelect(id)} className="justify-between">
                        {themeLabel(id)}
                        {id === theme && <Check size={14} className="text-primary" />}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
