package com.aiphotoeditor.undo;

import com.aiphotoeditor.undo.UndoRedoDtos.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/projects/{projectId}")
public class UndoRedoController {
    private final UndoRedoService service;

    public UndoRedoController(UndoRedoService service) { this.service = service; }

    @GetMapping("/undo-redo")
    public UndoRedoStatus status(@PathVariable long projectId) { return service.status(projectId); }

    @PostMapping("/undo")
    public UndoRedoResult undo(@PathVariable long projectId) { return service.undo(projectId); }

    @PostMapping("/redo")
    public UndoRedoResult redo(@PathVariable long projectId) { return service.redo(projectId); }
}
